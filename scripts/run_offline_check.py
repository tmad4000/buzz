import os,sys,subprocess,signal
p=subprocess.Popen(sys.argv[2:],start_new_session=True)
try: code=p.wait(timeout=int(sys.argv[1]))
except subprocess.TimeoutExpired:
 os.killpg(p.pid,signal.SIGTERM)
 try: p.wait(timeout=3)
 except subprocess.TimeoutExpired: os.killpg(p.pid,signal.SIGKILL); p.wait()
 code=124
finally:
 try: os.killpg(p.pid,signal.SIGKILL)
 except ProcessLookupError: pass
sys.exit(code)
