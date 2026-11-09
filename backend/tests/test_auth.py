from app import auth


def test_admin_api_needs_sign_in(client):
    assert client.get("/api/admin/products").status_code == 401
    assert client.patch("/api/admin/products/1", json={"price": 1}).status_code == 401
    assert client.get("/api/auth/me").status_code == 401


def test_admin_page_is_served(client):
    r = client.get("/admin/")
    assert r.status_code == 200 and "admin.js" in r.text
    assert "frame-ancestors 'none'" in r.headers["content-security-policy"]
    assert r.headers["x-robots-tag"].startswith("noindex")
    assert client.get("/admin/assets/admin.js").status_code == 200


def test_login_session_csrf_logout(client):
    assert client.post("/api/auth/login", json={"email": "admin@example.com", "password": "wrong"}).status_code == 401
    r = client.post("/api/auth/login", json={"email": "ADMIN@example.com ", "password": "correct horse battery"})
    assert r.status_code == 200
    cookie = r.headers["set-cookie"]
    assert "httponly" in cookie.lower() and "samesite=lax" in cookie.lower()
    csrf = r.json()["csrf"]
    assert client.get("/api/auth/me").json()["user"]["email"] == "admin@example.com"
    assert client.get("/api/admin/products").status_code == 200
    # changes need the CSRF header
    assert client.patch("/api/admin/media/1", json={"alt": "x"}).status_code == 403
    client.headers["X-CSRF-Token"] = "nope"
    assert client.patch("/api/admin/media/1", json={"alt": "x"}).status_code == 403
    client.headers["X-CSRF-Token"] = csrf
    alt = client.get("/api/admin/media").json()
    m = next(x for x in alt if x["id"] == 1)
    assert client.patch("/api/admin/media/1", json={"alt": m["alt"]}).status_code == 200
    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/admin/products").status_code == 401


def test_too_many_failures_are_refused(client):
    auth._fails.clear()
    for _ in range(auth._MAX_FAILS):
        assert client.post("/api/auth/login", json={"email": "who@example.com", "password": "nope"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "who@example.com", "password": "nope"}).status_code == 429
    auth._fails.clear()


def test_manage_users(admin):
    assert admin.post("/api/admin/users", json={"email": "sam@example.com", "name": "Sam", "password": "short"}).status_code == 422
    r = admin.post("/api/admin/users", json={"email": "Sam@Example.com", "name": "Sam", "password": "a long password"})
    assert r.status_code == 201
    sam = r.json()
    assert sam["email"] == "sam@example.com"
    assert admin.post("/api/admin/users", json={"email": "sam@example.com", "password": "a long password"}).status_code == 409

    from fastapi.testclient import TestClient
    from app.main import app
    other = TestClient(app)
    assert other.post("/api/auth/login", json={"email": "sam@example.com", "password": "a long password"}).status_code == 200
    assert other.get("/api/auth/me").status_code == 200
    # disabling signs them out
    assert admin.patch(f"/api/admin/users/{sam['id']}", json={"is_active": False}).status_code == 200
    assert other.get("/api/auth/me").status_code == 401
    assert other.post("/api/auth/login", json={"email": "sam@example.com", "password": "a long password"}).status_code == 401

    me = admin.get("/api/auth/me").json()["user"]
    assert admin.patch(f"/api/admin/users/{me['id']}", json={"is_active": False}).status_code == 422
    assert admin.delete(f"/api/admin/users/{me['id']}").status_code == 422
    assert admin.delete(f"/api/admin/users/{sam['id']}").status_code == 204


def test_change_password(admin):
    assert admin.post("/api/auth/password", json={"current": "wrong", "new": "another long one"}).status_code == 422
    assert admin.post("/api/auth/password", json={"current": "correct horse battery", "new": "short"}).status_code == 422
    assert admin.post("/api/auth/password", json={"current": "correct horse battery", "new": "another long one"}).status_code == 204
    assert admin.post("/api/auth/password", json={"current": "another long one", "new": "correct horse battery"}).status_code == 204


def test_password_hashing():
    h = auth.hash_password("secret value 1")
    assert h.startswith("scrypt$") and "secret" not in h
    assert auth.verify_password("secret value 1", h)
    assert not auth.verify_password("secret value 2", h)
    assert not auth.verify_password("x", "garbage")
