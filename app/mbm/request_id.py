"""
Request ID middleware and utilities for tracking requests across logs.
"""
import uuid
import threading

# Thread-local storage for request ID
_thread_locals = threading.local()


class RequestIDMiddleware:
    """
    Middleware that generates a unique request ID for each request and stores it
    in thread-local storage for access throughout the request lifecycle.
    """
    
    def __init__(self, get_response):
        self.get_response = get_response
    
    def __call__(self, request):
        # Generate a unique request ID for this request
        request_id = str(uuid.uuid4())[:8]  # Use first 8 chars for brevity
        
        # Store in thread-local storage
        _thread_locals.request_id = request_id
        
        # Also store on request object for convenience
        request.request_id = request_id
        
        # Debug: print to verify middleware is working
        import sys
        print(f"DEBUG: RequestIDMiddleware set request_id={request_id}", file=sys.stderr)
        
        response = self.get_response(request)
        
        # Note: We don't clear request_id here because Django's server logger
        # logs AFTER middleware completes. The request_id will be overwritten
        # on the next request anyway since we're using thread-local storage.
        
        return response


def get_request_id():
    """
    Get the current request ID from thread-local storage.
    Returns None if called outside of a request context.
    """
    return getattr(_thread_locals, 'request_id', None)

