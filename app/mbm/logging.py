import logging
from django.utils.log import ServerFormatter


def before_send(event, hint):
    """
    Log 400 Bad Request errors with the same custom fingerprint so that we can
    group them and ignore them all together. See:
    https://github.com/getsentry/sentry-python/issues/149#issuecomment-434448781
    """
    log_record = hint.get('log_record')
    if log_record and hasattr(log_record, 'name'):
        if log_record.name == 'django.security.DisallowedHost':
            event['fingerprint'] = ['disallowed-host']
    return event


class RequestIDFilter(logging.Filter):
    """
    Logging filter that adds the request ID to log records.
    """
    
    def filter(self, record):
        from mbm.request_id import get_request_id
        
        request_id = get_request_id()
        record.request_id = request_id if request_id else 'no-request'
        # Debug
        import sys
        print(f"DEBUG: RequestIDFilter got request_id={request_id} for logger={record.name}", file=sys.stderr)
        return True


class RequestIDServerFormatter(ServerFormatter):
    """
    Custom ServerFormatter that includes the request ID in Django server logs.
    """
    
    def format(self, record):
        # Ensure request_id is added to the record before formatting
        if not hasattr(record, 'request_id'):
            from mbm.request_id import get_request_id
            request_id = get_request_id()
            record.request_id = request_id if request_id else 'no-request'
            # Debug
            import sys
            print(f"DEBUG: RequestIDServerFormatter set request_id={request_id}", file=sys.stderr)
        else:
            import sys
            print(f"DEBUG: RequestIDServerFormatter using existing request_id={record.request_id}", file=sys.stderr)
        
        # Get the formatted message from the parent ServerFormatter
        msg = super().format(record)
        
        # Prepend the log level and request ID to match the simple format
        return f"{record.levelname} [rid={record.request_id}] {msg}"
