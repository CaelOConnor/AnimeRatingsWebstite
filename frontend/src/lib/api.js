const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function getToken() {
  return localStorage.getItem('token');
}

// Resolves to { data, status } on a 2xx response, or undefined for the
// 401 redirect-and-bail case below. Throws an Error with a `status`
// property (the response's HTTP status code) for any other non-2xx.
async function request(path, options = {}) {
  const token = getToken();

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers, // allows headers to be added or overrided
  };

  // authorization
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // network request
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers,
  });

  // If token is expired/invalid, clear it and reload to reset auth state
  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/';
    return;
  }

  const data = await res.json();

  if (!res.ok) {
    const error = new Error(data.error || 'Something went wrong');
    error.status = res.status;
    throw error;
  }

  return { data, status: res.status };
}

// Most callers only care about the response body, so the shorthand
// methods below unwrap `request()`'s { data, status } down to just
// `data` — same resolved shape as before this file exposed status.
// Callers that need the status code (e.g. distinguishing 201 vs 200 on
// success) use `api.raw.*` instead, which resolves to { data, status }.
function unwrap(promise) {
  return promise.then((result) => result?.data);
}

function buildRequest(method) {
  return (path, body) =>
    request(path, body !== undefined ? { method, body: JSON.stringify(body) } : { method });
}

const rawGet    = (path)       => request(path);
const rawPost   = buildRequest('POST');
const rawPut    = buildRequest('PUT');
const rawPatch  = buildRequest('PATCH');
const rawDelete = (path)       => request(path, { method: 'DELETE' });

export const api = {
  get:    (path)       => unwrap(rawGet(path)),
  post:   (path, body) => unwrap(rawPost(path, body)),
  put:    (path, body) => unwrap(rawPut(path, body)),
  patch:  (path, body) => unwrap(rawPatch(path, body)),
  delete: (path)        => unwrap(rawDelete(path)),
  upload: (path, formData) => {
    const token = getToken();
    return fetch(`${API}${path}`, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      body: formData,
    }).then(async (res) => {
      if (res.status === 401) {
        localStorage.removeItem('token');
        window.location.href = '/';
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        const error = new Error(data.error || 'Something went wrong');
        error.status = res.status;
        throw error;
      }
      return data;
    });
  },
  // Status-aware variants for the rare caller that needs the HTTP status
  // code of a successful response (e.g. 201 created vs 200 already-existed).
  raw: {
    get:    rawGet,
    post:   rawPost,
    put:    rawPut,
    patch:  rawPatch,
    delete: rawDelete,
  },
};