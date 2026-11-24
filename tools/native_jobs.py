"""Single-engine bounded jobs, leased to a polling web/MCP client.

No heartbeat for 30 seconds cancels the job (including a crashed browser).
Terminal status is written only after the callback has reaped native processes.
"""
import secrets
import subprocess
import threading
import time


class NativeJobs:
    def __init__(self, lease_seconds=30, deadline_seconds=300):
        self.jobs, self.controls = {}, {}
        self.lock = threading.Lock()
        self.lease_seconds, self.deadline_seconds = lease_seconds, deadline_seconds

    def submit(self, payload, execute):
        now = time.monotonic()
        with self.lock:
            for token, job in list(self.jobs.items()):
                if job['status'] not in {'running', 'cancelling'} and now - job.get('finished_at', now) > 3600:
                    del self.jobs[token]
            if any(j['status'] in {'running', 'cancelling'} for j in self.jobs.values()):
                raise ValueError('Another native job is already running; please wait for completion')
            if len(self.jobs) >= 64:
                raise ValueError('Job retention capacity reached; existing results will not be overwritten')
            token = secrets.token_urlsafe(24)
            event, done = threading.Event(), threading.Event()
            self.jobs[token] = {'status': 'running', 'message': 'Starting computation...',
                                'created_at': now, 'heartbeat': now}
            self.controls[token] = event

        def progress(message):
            with self.lock:
                self.jobs[token]['message'] = message

        def watch():
            while not done.wait(.1):
                with self.lock:
                    job = self.jobs[token]
                    if job['status'] not in {'running', 'cancelling'}:
                        return
                    reason = ('DEADLINE_EXCEEDED' if time.monotonic() - now > self.deadline_seconds
                              else 'CLIENT_DISCONNECTED' if time.monotonic() - job['heartbeat'] > self.lease_seconds
                              else None)
                    if reason and not event.is_set():
                        job.update(status='cancelling', cancel_code=reason)
                        event.set()

        def worker():
            try:
                result = execute(payload, progress, event)
                with self.lock:
                    if event.is_set():
                        raise RuntimeError('Computation cancelled')
                    self.jobs[token] = {'status': 'complete', 'result': result, 'finished_at': time.monotonic()}
            except Exception as error:
                with self.lock:
                    code = self.jobs[token].get('cancel_code') or (
                        'CANCELLED' if event.is_set() else
                        'DEADLINE_EXCEEDED' if isinstance(error, subprocess.TimeoutExpired) else
                        getattr(error, 'code', 'ENGINE_FAILED'))
                    self.jobs[token] = {'status': 'cancelled' if event.is_set() else 'failed',
                                        'error': str(error), 'code': code, 'retryable': False,
                                        'finished_at': time.monotonic()}
            finally:
                done.set()
                with self.lock:
                    self.controls.pop(token, None)

        threading.Thread(target=watch, daemon=True).start()
        threading.Thread(target=worker, daemon=True).start()
        return token

    def status(self, token):
        with self.lock:
            job = self.jobs.get(token)
            if job and job['status'] not in {'running', 'cancelling'} and time.monotonic() - job.get('finished_at', time.monotonic()) > 3600:
                del self.jobs[token]
                job = None
            if job and job['status'] in {'running', 'cancelling'}:
                job['heartbeat'] = time.monotonic()
            return (job or {'status': 'expired', 'code': 'JOB_EXPIRED', 'error': 'Job expired or not found; please resubmit explicitly'}).copy()

    def cancel(self, token):
        with self.lock:
            event = self.controls.get(token)
            if event:
                self.jobs[token].update(status='cancelling', cancel_code='CANCELLED')
                event.set()
        return self.status(token)

    def forget(self, token):
        with self.lock:
            if token not in self.jobs:
                return False
            if self.jobs[token]['status'] in {'running', 'cancelling'}:
                raise ValueError('Running jobs cannot be deleted')
            del self.jobs[token]
            return True
