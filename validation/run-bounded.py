import os,signal,subprocess,sys
p=subprocess.Popen(['setsid',*sys.argv[2:]])
try:
 code=p.wait(timeout=int(sys.argv[1]))
except subprocess.TimeoutExpired:
 os.killpg(p.pid,signal.SIGKILL);p.wait();sys.exit(124)
finally:
 try:os.killpg(p.pid,signal.SIGKILL)
 except ProcessLookupError:pass
sys.exit(code)
