#!/usr/bin/env python3
"""Generate synthetic media and serve it locally; never accepts real credentials.
Requires ffmpeg. Stop with Ctrl-C. All media requests require both fixture headers.
"""
import argparse, http.server, json, os, re, subprocess
from pathlib import Path

repo = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, default=42187)
parser.add_argument('--root', type=Path, default=repo/'native/.build/media-fixture')
args = parser.parse_args()
root = args.root.resolve(); media = root/'media'; media.mkdir(parents=True, exist_ok=True)
def run(*command): subprocess.run(command, cwd=repo, check=True, stdout=subprocess.DEVNULL)
if not (media/'multi.mp4').exists():
    (media/'captions.srt').write_text('1\n00:00:00,000 --> 00:05:00,000\nCinefern subtitle fixture\n')
    run('ffmpeg','-v','error','-y','-f','lavfi','-i','testsrc2=size=320x180:rate=8','-f','lavfi','-i','sine=frequency=440','-f','lavfi','-i','sine=frequency=880','-i',str(media/'captions.srt'),'-t','300','-map','0:v','-map','1:a','-map','2:a','-map','3:s','-c:v','libx264','-preset','ultrafast','-g','16','-pix_fmt','yuv420p','-c:a','aac','-filter:a','volume=0.02','-c:s','mov_text','-metadata:s:a:0','language=eng','-metadata:s:a:0','title=English','-metadata:s:a:1','language=deu','-metadata:s:a:1','title=Deutsch','-metadata:s:s:0','language=eng','-movflags','+faststart',str(media/'multi.mp4'))
if not (media/'multi.mkv').exists():
    run('ffmpeg','-v','error','-y','-i',str(media/'multi.mp4'),'-map','0','-c','copy','-c:s','srt',str(media/'multi.mkv'))
if not (media/'hls/master.m3u8').exists():
    hls = media/'hls'; hls.mkdir(exist_ok=True)
    (hls/'key.bin').write_bytes(os.urandom(16))
    (hls/'key-info.txt').write_text('key.bin\n'+str(hls/'key.bin')+'\n')
    run('ffmpeg','-v','error','-y','-i',str(media/'multi.mp4'),'-map','0:v','-map','0:a:0','-c','copy','-hls_time','4','-hls_list_size','0','-hls_key_info_file',str(hls/'key-info.txt'),str(hls/'master.m3u8'))
if not (media/'dash/manifest.mpd').exists():
    dash = media/'dash'; dash.mkdir(exist_ok=True)
    run('ffmpeg','-v','error','-y','-i',str(media/'multi.mp4'),'-map','0:v','-map','0:a:0','-c','copy','-seg_duration','4','-f','dash',str(dash/'manifest.mpd'))
run('node','scripts/build-provider.mjs','native/Tests/MediaFixture/provider.ts','native/Tests/MediaFixture/manifest.json',str(root/'fixture.cfprovider'))
class Handler(http.server.BaseHTTPRequestHandler):
    def do_HEAD(self): self.serve(head=True)
    def do_GET(self): self.serve()
    def log_message(self, *_): pass
    def serve(self, head=False):
        path = self.path.split('?',1)[0]
        if path.startswith('/media/'):
            authorized = self.headers.get('Authorization') == 'Bearer cinefern-local-test' and self.headers.get('X-Cinefern-Fixture') == 'required'
            print(json.dumps({'resource':path,'authorized':authorized,'range':self.headers.get('Range'),'method':self.command}),flush=True)
            if not authorized: self.send_error(401); return
        target = (root/path.lstrip('/')).resolve()
        if not target.is_relative_to(root) or not target.is_file() or target.name.endswith(('.txt','.py')):
            self.send_error(404); return
        size = target.stat().st_size; start=0; end=size-1
        match = re.fullmatch(r'bytes=(\d+)-(\d*)',self.headers.get('Range',''))
        if match:
            start=int(match[1]); end=min(size-1,int(match[2]) if match[2] else size-1)
            if start>end: self.send_error(416); return
        self.send_response(206 if match else 200)
        types={'.m3u8':'application/vnd.apple.mpegurl','.mpd':'application/dash+xml','.mp4':'video/mp4','.mkv':'video/x-matroska','.ts':'video/mp2t','.cfprovider':'application/json'}
        self.send_header('Content-Type',types.get(target.suffix,'application/octet-stream'))
        self.send_header('Content-Length',str(end-start+1)); self.send_header('Accept-Ranges','bytes')
        if match: self.send_header('Content-Range',f'bytes {start}-{end}/{size}')
        self.end_headers()
        if not head:
            try:
                with target.open('rb') as f:
                    f.seek(start); remaining=end-start+1
                    while remaining:
                        data=f.read(min(65536,remaining))
                        if not data: break
                        self.wfile.write(data);remaining-=len(data)
            except (BrokenPipeError,ConnectionResetError): pass
print(f'Fixture bundle: http://127.0.0.1:{args.port}/fixture.cfprovider',flush=True)
http.server.ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()
