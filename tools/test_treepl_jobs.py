"""Exercise HTTP dating job cancellation with a real slow child, no shared service."""
import io
import json
from pathlib import Path
import sys
import threading
import time
import unittest
from unittest.mock import patch
import local_server as server
from native_jobs import NativeJobs
from process_supervisor import run_managed, ACTIVE


class DatingJobTests(unittest.TestCase):
    def request(self, endpoint, payload):
        handler = object.__new__(server.PhyloRenderHandler)
        body = json.dumps(payload).encode()
        handler.path, handler.headers, handler.rfile = endpoint, {'Content-Length':str(len(body))}, io.BytesIO(body)
        handler.allowed = lambda **kwargs: True
        responses = []
        handler.send_json = lambda code, result: responses.append((code, result))
        handler.do_POST()
        return responses[0]

    def exercise(self, lease=None, deadline=None):
        jobs = NativeJobs(lease_seconds=lease or 30, deadline_seconds=deadline or 300)
        began = threading.Event()
        def slow(command, work, log, **kwargs):
            # Verify the real dating code uses the managed API and passes cancel.
            self.assertEqual(command[1], 'run.config')
            self.assertIsNotNone(kwargs['cancel_event'])
            began.set()
            return run_managed([sys.executable, '-c', 'import time;time.sleep(60)'],work,log,**kwargs)
        with patch.object(server, 'DATING_JOBS', jobs), patch.object(server,'bundled_treepl',return_value=Path(sys.executable)), patch.object(server,'run_managed',side_effect=slow):
            code, response = self.request('/api/cloud-date/jobs', {'age':70,'trees':[{'newick':'(T00000:1,(T00001:1,T00002:1):1);','rootTips':['T00000','T00001']}]})
            self.assertEqual(code,202)
            token=response['job']
            self.assertTrue(began.wait(2))
            if not lease and not deadline:
                code, _ = self.request(f'/api/cloud-date/jobs/{token}/cancel',{})
                self.assertEqual(code,200)
            if lease:
                time.sleep(.8)  # no poll; model a dead browser/MCP owner
            for _ in range(150):
                result=jobs.status(token)
                if result['status'] not in {'running','cancelling'}:
                    break
                time.sleep(.02)
            self.assertEqual(result['status'],'cancelled')
            self.assertEqual(result['code'],'CLIENT_DISCONNECTED' if lease else 'DEADLINE_EXCEEDED' if deadline else 'CANCELLED')
            self.assertNotIn('result',result)
            self.assertFalse(ACTIVE,'Terminal status must follow native process reaping')
            self.assertTrue(server.DATING_SLOT.acquire(blocking=False))
            server.DATING_SLOT.release()

    def test_http_cancel_reaps_dating_process(self):
        self.exercise()

    def test_total_deadline_reaps_dating_process(self):
        self.exercise(deadline=.1)

    def test_crashed_client_lease_reaps_dating_process(self):
        self.exercise(lease=.1)


if __name__=='__main__':
    unittest.main()
