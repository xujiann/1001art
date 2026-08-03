#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""腾讯云 COS 分块上传（纯标准库，含续传）。

为何需要：cos_upload.py 是整文件一次性 PUT——上行被限速时，
一个 30MB 的文件跑不完超时就整份重来，永远传不上去（2026-08-03 实测：
15 分钟只成功 1 张 5.6MB）。分块后每块只有 4MB，单块失败只重传该块，
已传的块留在 COS 上，跨进程也能续。

用法: python cos_multipart.py <本地目录> <远端前缀> --list <清单> [--part-mb 4]
密钥同样只从环境变量 COS_SECRET_ID / COS_SECRET_KEY 读。
进度与已传块记在 <清单>.state.json，中断后再跑会自动接上。
"""
import hashlib, hmac, json, os, re, sys, time, urllib.parse, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

try:                      # Windows 控制台默认 GBK，印 ✓/✗ 会抛 UnicodeEncodeError
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

BUCKET = os.environ.get("COS_BUCKET", "pic-1302017848")
REGION = os.environ.get("COS_REGION", "ap-nanjing")
SID    = os.environ.get("COS_SECRET_ID", "")
SKEY   = os.environ.get("COS_SECRET_KEY", "")
HOST   = "%s.cos.%s.myqcloud.com" % (BUCKET, REGION)
TIMEOUT = int(os.environ.get("COS_TIMEOUT", "300"))


def sign(method, uri, params=None, headers=None, expire=3600):
    """q-sign-algorithm=sha1 签名。params 必须参与签名，否则带 uploadId 的请求会被拒。"""
    params = params or {}
    headers = headers or {}
    now = int(time.time())
    key_time = "%d;%d" % (now - 60, now + expire)
    sign_key = hmac.new(SKEY.encode(), key_time.encode(), hashlib.sha1).hexdigest()

    def kv(d):
        low = {k.lower(): str(d[k]) for k in d}
        keys = sorted(low)
        s = "&".join("%s=%s" % (k, urllib.parse.quote(low[k], safe="")) for k in keys)
        return ";".join(keys), s

    param_list, param_str = kv(params)
    header_list, header_str = kv(headers)
    http_string = "%s\n%s\n%s\n%s\n" % (method.lower(), uri, param_str, header_str)
    string_to_sign = "sha1\n%s\n%s\n" % (key_time, hashlib.sha1(http_string.encode()).hexdigest())
    signature = hmac.new(sign_key.encode(), string_to_sign.encode(), hashlib.sha1).hexdigest()
    return ("q-sign-algorithm=sha1&q-ak=%s&q-sign-time=%s&q-key-time=%s"
            "&q-header-list=%s&q-url-param-list=%s&q-signature=%s"
            % (SID, key_time, key_time, header_list, param_list, signature))


def request(method, key, params=None, body=None, ctype=None, timeout=None):
    params = params or {}
    uri = "/" + urllib.parse.quote(key)
    qs = urllib.parse.urlencode(params) if params else ""
    url = "https://%s%s%s" % (HOST, uri, ("?" + qs) if qs else "")
    headers = {"Host": HOST}
    if ctype:
        headers["Content-Type"] = ctype
    auth = sign(method, uri, params, {"host": HOST})
    h = dict(headers)
    h["Authorization"] = auth
    if body is not None:
        h["Content-Length"] = str(len(body))
    req = urllib.request.Request(url, data=body, method=method, headers=h)
    with urllib.request.urlopen(req, timeout=timeout or TIMEOUT) as r:
        return r.status, dict(r.headers), r.read()


def ctype_of(key):
    k = key.lower()
    return ("image/jpeg" if k.endswith((".jpg", ".jpeg")) else
            "image/png" if k.endswith(".png") else
            "image/gif" if k.endswith(".gif") else
            "image/webp" if k.endswith(".webp") else "application/octet-stream")


def head_size(key):
    try:
        st, h, _ = request("HEAD", key, timeout=60)
        return int(h.get("Content-Length", 0)) if st == 200 else -1
    except Exception:
        return -1


def initiate(key):
    st, h, b = request("POST", key, {"uploads": ""}, b"", ctype_of(key), timeout=120)
    m = re.search(rb"<UploadId>(.*?)</UploadId>", b)
    if not m:
        raise RuntimeError("初始化分块上传失败: %s" % b[:200])
    return m.group(1).decode()


def list_parts(key, upload_id):
    """已在 COS 上的块 -> {partNumber: etag}，用于跨进程续传。"""
    got = {}
    try:
        st, h, b = request("GET", key, {"uploadId": upload_id}, timeout=120)
        for blk in re.findall(rb"<Part>(.*?)</Part>", b, re.S):
            n = re.search(rb"<PartNumber>(\d+)</PartNumber>", blk)
            e = re.search(rb"<ETag>(.*?)</ETag>", blk)
            if n and e:
                got[int(n.group(1))] = e.group(1).decode()
    except Exception:
        pass
    return got


def upload_part(key, upload_id, n, chunk):
    st, h, _ = request("PUT", key, {"partNumber": str(n), "uploadId": upload_id}, chunk)
    etag = h.get("ETag")
    if st not in (200, 204) or not etag:
        raise RuntimeError("块 %d 上传失败 HTTP %s" % (n, st))
    return etag


def complete(key, upload_id, parts):
    xml = "<CompleteMultipartUpload>%s</CompleteMultipartUpload>" % "".join(
        "<Part><PartNumber>%d</PartNumber><ETag>%s</ETag></Part>" % (n, parts[n])
        for n in sorted(parts))
    st, h, b = request("POST", key, {"uploadId": upload_id}, xml.encode(), "application/xml", timeout=600)
    if st != 200 or b"<ETag>" not in b:
        raise RuntimeError("合并失败 HTTP %s %s" % (st, b[:200]))


def put_file(path, key, part_size, state, save_state, par=1):
    size = os.path.getsize(path)
    if head_size(key) == size:
        print("  = %s 已在 COS（%.1fMB），跳过" % (key, size / 1048576))
        return True
    total = (size + part_size - 1) // part_size
    stk = state.setdefault(key, {})
    upload_id = stk.get("uploadId")
    parts = {int(k): v for k, v in (stk.get("parts") or {}).items()}
    if upload_id:
        remote = list_parts(key, upload_id)
        if not remote and parts:
            upload_id = None; parts = {}      # uploadId 已失效，重来
        else:
            parts = {n: e for n, e in parts.items() if remote.get(n) == e}
            parts.update(remote)
    if not upload_id:
        upload_id = initiate(key)
        parts = {}
    stk["uploadId"] = upload_id
    stk["parts"] = {str(n): e for n, e in parts.items()}
    save_state()
    print("  %s %.1fMB · %d 块 · 已传 %d" % (key, size / 1048576, total, len(parts)))
    todo = [n for n in range(1, total + 1) if n not in parts]

    def one(n):
        with open(path, "rb") as fh:
            fh.seek((n - 1) * part_size)
            chunk = fh.read(part_size)
        for attempt in range(6):
            t0 = time.time()
            try:
                etag = upload_part(key, upload_id, n, chunk)
                dt = max(time.time() - t0, .001)
                print("    块 %d/%d ok %.0fKB/s" % (n, total, len(chunk) / 1024 / dt))
                sys.stdout.flush()
                return n, etag
            except Exception as e:
                print("    块 %d/%d 第 %d 次失败: %s" % (n, total, attempt + 1, str(e)[:80]))
                sys.stdout.flush()
                time.sleep(3 * (attempt + 1))
        return n, None

    with ThreadPoolExecutor(max_workers=par) as ex:
        for n, etag in ex.map(one, todo):
            if etag is None:
                print("  ✗ %s 块 %d 反复失败，本轮放弃（已传块保留，下次续）" % (key, n))
                return False
            parts[n] = etag
            stk["parts"] = {str(k): v for k, v in parts.items()}
            save_state()
    complete(key, upload_id, parts)
    ok = head_size(key) == size
    print("  %s %s" % ("✓" if ok else "✗ 大小不符", key))
    if ok:
        state.pop(key, None); save_state()
    return ok


def main():
    if not SID or not SKEY:
        print("缺少 COS_SECRET_ID / COS_SECRET_KEY 环境变量"); sys.exit(1)
    src, prefix = sys.argv[1], sys.argv[2].strip("/")
    listf = sys.argv[sys.argv.index("--list") + 1]
    part_size = int(sys.argv[sys.argv.index("--part-mb") + 1] if "--part-mb" in sys.argv else 4) * 1048576
    par = int(sys.argv[sys.argv.index("--par") + 1]) if "--par" in sys.argv else 1
    files = [ln.strip() for ln in open(listf, encoding="utf-8") if ln.strip()]
    files = [f for f in files if os.path.isfile(os.path.join(src, f))]
    spath = listf + ".state.json"
    state = json.load(open(spath, encoding="utf-8")) if os.path.exists(spath) else {}

    def save_state():
        json.dump(state, open(spath, "w", encoding="utf-8"))

    print("分块上传 %d 个文件 -> cos://%s/%s/ (每块 %dMB，并发 %d)"
          % (len(files), BUCKET, prefix, part_size // 1048576, par))
    ok = 0
    for f in files:
        try:
            if put_file(os.path.join(src, f), "%s/%s" % (prefix, f), part_size, state, save_state, par):
                ok += 1
        except Exception as e:
            print("  ✗ %s: %s" % (f, str(e)[:120]))
        sys.stdout.flush()
    print("=== 完成 %d/%d ===" % (ok, len(files)))
    sys.exit(0 if ok == len(files) else 1)


if __name__ == "__main__":
    main()
