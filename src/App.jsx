import { useEffect, useState } from 'react';

const TOKEN_KEY = 'stockroom_token';
const API_BASE = 'http://localhost:7001/api';

function formatPrice(price) {
  const numericValue = Number(price) || 0;
  return `Rp. ${new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(numericValue)}`;
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (response.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.hash = '';
    throw new Error('Your session has expired. Please sign in again.');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || body.error || `Request failed (${response.status})`);
  }
  return response.status === 204 ? null : response.json();
}

function LoginPage({ onLogin }) {
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const result = await request('/public/staff/authenticate', { method: 'POST', body: JSON.stringify(form) });
      const token = result.content?.token || result.token || result.access_token;
      if (!token) throw new Error('The server did not return an access token.');
      localStorage.setItem(TOKEN_KEY, token);
      onLogin();
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="page login-page" aria-labelledby="login-title">
      <div className="login-card">
        <div className="brand-mark">S</div>
        <p className="eyebrow">STAFF PORTAL</p>
        <h1 id="login-title">Welcome back</h1>
        <p className="muted">Sign in to manage your product inventory.</p>
        <form onSubmit={submit}>
          <label htmlFor="username">Username</label>
          <input id="username" value={form.username} autoComplete="username" onChange={(event) => setForm({ ...form, username: event.target.value })} required />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" value={form.password} autoComplete="current-password" onChange={(event) => setForm({ ...form, password: event.target.value })} required />
          <p className="form-error" role="alert">{error}</p>
          <button className="button primary full-width" type="submit" disabled={submitting}>{submitting ? 'Signing in...' : <>Sign in <span aria-hidden="true">→</span></>}</button>
        </form>
      </div>
    </section>
  );
}

function ProductModal({ product, onClose, onSaved }) {
  const [form, setForm] = useState(product || { name: '', description: '', price: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const isEditing = Boolean(product);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = {
        name: form.name.trim(),
        price: Number(form.price),
        description: form.description.trim(),
      };
      if (isEditing) body.id = Number(product.id);
      await request(isEditing ? '/product/update' : '/product/create', {
        method: 'POST',
        headers: isEditing ? { 'Idempotency-Key': crypto.randomUUID() } : undefined,
        body: JSON.stringify(body),
      });
      onSaved(isEditing ? 'Product updated successfully.' : 'Product created successfully.');
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <button className="close-button" type="button" onClick={onClose} aria-label="Close">×</button>
        <p className="eyebrow">PRODUCT DETAILS</p>
        <h2 id="modal-title">{isEditing ? 'Edit product' : 'Add product'}</h2>
        <form onSubmit={submit}>
          <label htmlFor="product-name">Name</label>
          <input id="product-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          <label htmlFor="product-description">Description</label>
          <textarea id="product-description" rows="3" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required />
          <label htmlFor="product-price">Price</label>
          <input id="product-price" type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} required />
          <p className="form-error" role="alert">{error}</p>
          <div className="modal-actions">
            <button className="button secondary" type="button" onClick={onClose}>Cancel</button>
            <button className="button primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save product'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProductsPage({ onLogout }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState(null);
  const [pagination, setPagination] = useState({ totalElements: 0, totalPages: 0, currentPage: 1 });
  const [filters, setFilters] = useState({ name: '', min_price: '1000', max_price: '100000' });

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  async function loadProducts(nextFilters = filters, requestedPage = 1) {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(requestedPage), size: '10' });
      Object.entries(nextFilters).forEach(([key, value]) => {
        if (value && value.trim()) params.set(key, value.trim());
      });
      const result = await request(`/product/get?${params.toString()}`);
      const content = result?.content;
      const productList = Array.isArray(content?.content)
        ? content.content
        : Array.isArray(result)
          ? result
          : Array.isArray(content)
            ? content
            : content?.data || content?.products || result?.data || result?.products || [];
      setProducts(Array.isArray(productList) ? productList : []);
      setPagination({
        totalElements: Number(content?.totalElements ?? 0),
        totalPages: Number(content?.totalPages ?? 0),
        currentPage: Number(requestedPage),
      });
      setPage(requestedPage);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadProducts(); }, []);

  function updateFilter(key, value) {
    if (key !== 'name' && !/^\d*(\.\d*)?$/.test(value)) return;
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function search(event) {
    event.preventDefault();
    if (filters.min_price && filters.max_price && Number(filters.min_price) > Number(filters.max_price)) {
      setError('Minimum price cannot be greater than maximum price.');
      return;
    }
    loadProducts(filters, 1);
  }

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [page, setPage] = useState(1);

  async function confirmDeleteProduct() {
    if (!deleteTarget) return;
    try {
      await request('/product/delete', {
        method: 'POST',
        body: JSON.stringify({ id: Number(deleteTarget.id) }),
      });
      setDeleteTarget(null);
      setToast('Product deleted successfully.');
      await loadProducts();
    } catch (deleteError) {
      setError(deleteError.message);
      setDeleteTarget(null);
    }
  }

  async function changePage(nextPage) {
    if (!Number.isInteger(nextPage) || nextPage < 1 || nextPage > pagination.totalPages) return;
    const params = new URLSearchParams({ page: String(nextPage), size: '10' });
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value.trim()) params.set(key, value.trim());
    });
    setPage(nextPage);
    setLoading(true);
    try {
      const result = await request(`/product/get?${params.toString()}`);
      const content = result?.content;
      const nextProducts = Array.isArray(content?.content) ? content.content : [];
      setProducts(nextProducts);
      setPagination({
        totalElements: Number(content?.totalElements ?? 0),
        totalPages: Number(content?.totalPages ?? 0),
        currentPage: nextPage,
      });
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    onLogout();
  }

  return (
    <section className="page products-page" aria-labelledby="products-title">
      <header className="topbar">
        <a className="wordmark" href="#products" aria-label="Stockroom home"><span>S</span> stockroom</a>
        <button className="button ghost" type="button" onClick={logout}>Sign out</button>
      </header>
      <div className="content">
        <div className="page-heading">
          <div><p className="eyebrow">INVENTORY</p><h1 id="products-title">All products</h1><p className="muted">Keep your catalog accurate and up to date.</p></div>
          <button className="button primary" type="button" onClick={() => setEditing({})}><span aria-hidden="true">+</span> Add product</button>
        </div>
        <form className="filter-bar" onSubmit={search}>
          <div><label htmlFor="search-name">Name</label><input id="search-name" type="search" value={filters.name} placeholder="Search by name" onChange={(event) => updateFilter('name', event.target.value)} /></div>
          <div><label htmlFor="min-price">Min price</label><input id="min-price" type="text" inputMode="decimal" pattern="[0-9]*([.][0-9]*)?" value={filters.min_price} placeholder="1000" onChange={(event) => updateFilter('min_price', event.target.value)} /></div>
          <div><label htmlFor="max-price">Max price</label><input id="max-price" type="text" inputMode="decimal" pattern="[0-9]*([.][0-9]*)?" value={filters.max_price} placeholder="100000" onChange={(event) => updateFilter('max_price', event.target.value)} /></div>
          <button className="button secondary filter-submit" type="submit">Search</button>
        </form>
        {error && <div className="notice error" role="alert">{error}</div>}
        <div className="pagination-summary">
          <strong>{pagination.totalElements}</strong> items found · <strong>{pagination.totalPages}</strong> page(s) available · current page <strong>{pagination.currentPage}</strong>
        </div>
        {pagination.totalPages > 1 && (
          <div className="pagination-controls">
            <button className="button secondary" type="button" disabled={page <= 1} onClick={() => changePage(page - 1)}>Previous</button>
            <span>Page {page} of {pagination.totalPages}</span>
            <button className="button secondary" type="button" disabled={page >= pagination.totalPages} onClick={() => changePage(page + 1)}>Next</button>
          </div>
        )}
        <div className="table-card">
          {loading && <div className="loading">Loading products...</div>}
          {!loading && !products.length && <div className="empty-state"><strong>No products yet</strong><span>Add your first product to get started.</span></div>}
          {!loading && products.length > 0 && <div className="table-wrap"><table><thead><tr><th>Name</th><th>Description</th><th>Price</th><th className="actions-heading">Actions</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td>{product.name}</td><td>{product.description}</td><td>{formatPrice(product.price)}</td><td className="actions-heading"><button className="action-button" type="button" onClick={() => setEditing(product)}>Edit</button><button className="action-button delete" type="button" onClick={() => setDeleteTarget(product)}>Delete</button></td></tr>)}</tbody></table></div>}
        </div>
      </div>
      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
      {deleteTarget && (
        <div className="modal-backdrop">
          <div className="modal delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-title">
            <p className="eyebrow">CONFIRM DELETE</p>
            <h2 id="delete-title">Delete product?</h2>
            <p className="delete-message">Are you sure you want to delete <strong>{deleteTarget.name}</strong>?</p>
            <div className="modal-actions">
              <button className="button secondary" type="button" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="button primary danger" type="button" onClick={confirmDeleteProduct}>Delete</button>
            </div>
          </div>
        </div>
      )}
      {editing && <ProductModal product={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={async (message) => { setEditing(null); await loadProducts(); setToast(message); }} />}
    </section>
  );
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(Boolean(localStorage.getItem(TOKEN_KEY)));
  const [route, setRoute] = useState(window.location.hash);

  useEffect(() => {
    const handleHashChange = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    if (authenticated && route !== '#products') window.location.hash = 'products';
    if (!authenticated && route === '#products') window.location.hash = '';
  }, [authenticated, route]);

  if (authenticated && route === '#products') return <ProductsPage onLogout={() => setAuthenticated(false)} />;
  return <LoginPage onLogin={() => setAuthenticated(true)} />;
}
