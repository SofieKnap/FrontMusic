// Kør med: node --test tests/admin.test.cjs
// API'et erstattes kun i testene. Der sendes ingen ændringer til Azure.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createApp() {
    let vueOptions;
    const calls = [];
    const stored = new Map();
    const axios = {
        get: async (url, options) => { calls.push({ method: 'get', url, options }); return { data: [] }; },
        post: async (url, body, options) => { calls.push({ method: 'post', url, body, options }); return { data: { token: 'test-token' } }; },
        put: async (url, body, options) => { calls.push({ method: 'put', url, body, options }); return { data: body }; },
        delete: async (url, options) => { calls.push({ method: 'delete', url, options }); return { data: {} }; }
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8'), {
        window: {},
        Vue: { createApp(options) { vueOptions = options; return { mount() {} }; } },
        axios,
        localStorage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) },
        console: { error() {} }
    });
    const app = vueOptions.data();
    for (const [name, method] of Object.entries(vueOptions.methods)) app[name] = method.bind(app);
    for (const [name, getter] of Object.entries(vueOptions.computed)) Object.defineProperty(app, name, { get: getter.bind(app) });
    const dialog = () => ({ open: false, showModal() { this.open = true; }, close() { this.open = false; } });
    app.$refs = { loginDialog: dialog(), albumDialog: dialog(), deleteDialog: dialog(), details: dialog() };
    app.$nextTick = callback => callback();
    return { app, axios, calls, stored };
}
const album = () => ({ id: 17, title: 'Test & sang', artist: 'Testkunstner', duration: 180, publicationYear: 2026 });

test('Login sender oplysninger til login-endpointet og gemmer token i hukommelsen', async () => {
    const { app, calls, stored } = createApp();
    app.openLogin();
    app.loginUsername = 'admin';
    app.loginPassword = 'test-password';
    await app.login();
    assert.ok(calls[0].url.endsWith('/api/Auth/login'));
    assert.equal(calls[0].body.username, 'admin');
    assert.equal(calls[0].body.password, 'test-password');
    assert.equal(app.token, 'test-token');
    assert.equal(app.username, 'admin');
    assert.equal(app.loginPassword, '');
    assert.equal(app.$refs.loginDialog.open, false);
    assert.equal(stored.size, 0); // Hverken adgangskode eller token skrives til localStorage.
});

test('Forkert login viser fejl og beholder login-dialogen', async () => {
    const { app, axios } = createApp();
    app.openLogin();
    app.loginPassword = 'forkert';
    axios.post = async () => { throw { response: { status: 401 } }; };
    await app.login();
    assert.equal(app.token, '');
    assert.match(app.loginError, /forkert/);
    assert.equal(app.loginPassword, '');
    assert.equal(app.loggingIn, false);
    assert.equal(app.$refs.loginDialog.open, true);
});

test('Login afviser et svar uden token', async () => {
    const { app, axios } = createApp();
    axios.post = async () => ({ data: {} });
    await app.login();
    assert.equal(app.token, '');
    assert.ok(app.loginError.length > 0);
});

test('Log ud fjerner token og lukker redigeringsdialoger', () => {
    const { app } = createApp();
    app.token = 'test-token';
    app.username = 'admin';
    app.$refs.albumDialog.showModal();
    app.$refs.deleteDialog.showModal();
    app.logout();
    assert.equal(app.token, '');
    assert.equal(app.username, '');
    assert.equal(app.$refs.albumDialog.open, false);
    assert.equal(app.$refs.deleteDialog.open, false);
});

test('Musik kan ikke ændres gennem formularerne uden login', async () => {
    const { app, calls } = createApp();
    app.openCreate();
    app.openEdit(album());
    app.openDelete(album());
    await app.saveAlbum();
    await app.deleteAlbum();
    assert.equal(app.$refs.albumDialog.open, false);
    assert.equal(app.$refs.deleteDialog.open, false);
    assert.equal(calls.length, 0);
});

test('Tilføj sender gyldige musikdata og Bearer-token til POST', async () => {
    const { app, calls } = createApp();
    app.token = 'test-token';
    app.openCreate();
    app.albumForm = album();
    await app.saveAlbum();
    assert.equal(calls[0].method, 'post');
    assert.ok(calls[0].url.endsWith('/api/Collection'));
    assert.equal(calls[0].body.title, 'Test & sang');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer test-token');
    assert.equal(calls[1].method, 'get');
    assert.equal(app.$refs.albumDialog.open, false);
    assert.equal(app.notice, 'Nummeret er tilføjet.');
});

for (const [name, changes] of [['tom titel', { title: ' ' }], ['varighed 0', { duration: 0 }], ['ugyldigt år', { publicationYear: 10000 }]]) {
    test('Formularen afviser ' + name + ' uden et API-kald', async () => {
        const { app, calls } = createApp();
        app.token = 'test-token';
        app.albumForm = { ...album(), ...changes };
        await app.saveAlbum();
        assert.equal(calls.length, 0);
        assert.ok(app.formError.length > 0);
    });
}

test('Redigering bruger en kopi, og opdatering bevarer favorit ved ændret titel', async () => {
    const { app, calls } = createApp();
    app.token = 'test-token';
    const original = album();
    app.favorites = [app.albumKey(original)];
    app.openEdit(original);
    app.albumForm.title = 'Ny titel';
    assert.equal(original.title, 'Test & sang');
    await app.saveAlbum();
    assert.equal(calls[0].method, 'put');
    assert.ok(calls[0].url.endsWith('/17'));
    assert.equal(calls[0].body.title, 'Ny titel');
    assert.equal(calls[0].body.id, undefined);
    assert.equal(calls[0].options.headers.Authorization, 'Bearer test-token');
    assert.equal(app.favorites[0], app.albumKey({ ...original, title: 'Ny titel' }));
});

test('Slet-dialogen sender først DELETE, når sletningen bekræftes', async () => {
    const { app, calls } = createApp();
    app.token = 'test-token';
    const record = album();
    app.favorites = [app.albumKey(record)];
    app.openDelete(record);
    assert.equal(calls.length, 0);
    assert.equal(app.$refs.deleteDialog.open, true);
    await app.deleteAlbum();
    assert.equal(calls[0].method, 'delete');
    assert.ok(calls[0].url.endsWith('/17'));
    assert.equal(calls[0].options.headers.Authorization, 'Bearer test-token');
    assert.equal(app.favorites.length, 0);
    assert.equal(app.notice, 'Nummeret er slettet.');
    assert.equal(app.$refs.deleteDialog.open, false);
});

test('En dublet viser en fejl og lader formularen blive åben', async () => {
    const { app, axios } = createApp();
    app.token = 'test-token';
    app.openCreate();
    app.albumForm = album();
    axios.post = async () => { throw { response: { status: 409 } }; };
    await app.saveAlbum();
    assert.match(app.formError, /allerede/);
    assert.equal(app.$refs.albumDialog.open, true);
    assert.equal(app.saving, false);
});

test('Et udløbet login logger ud og viser besked uden for den lukkede dialog', async () => {
    const { app, axios } = createApp();
    app.token = 'udloebet-token';
    app.openCreate();
    app.albumForm = album();
    axios.post = async () => { throw { response: { status: 401 } }; };
    await app.saveAlbum();
    assert.equal(app.token, '');
    assert.match(app.actionError, /udløbet/);
    assert.equal(app.$refs.albumDialog.open, false);
});

test('Manglende Admin-adgang viser fejl og fjerner ikke musik eller favoritter', async () => {
    const { app, axios } = createApp();
    app.token = 'test-token';
    const record = album();
    app.favorites = [app.albumKey(record)];
    app.openDelete(record);
    axios.delete = async () => { throw { response: { status: 403 } }; };
    await app.deleteAlbum();
    assert.match(app.formError, /ikke adgang/);
    assert.equal(app.favorites.length, 1);
    assert.equal(app.$refs.deleteDialog.open, true);
    assert.equal(app.token, 'test-token');
});

test('Gamle favoritter overføres til id, når samlingen hentes', async () => {
    const { app, axios } = createApp();
    const record = album();
    app.favorites = [JSON.stringify([record.title, record.artist, record.publicationYear])];
    axios.get = async () => ({ data: [record] });
    await app.searchAlbums();
    assert.equal(app.favorites[0], '17');
    assert.equal(app.isFavorite({ ...record, title: 'Ny titel' }), true);
});

test('En ældre API-udgave uden gyldige id’er afvises', async () => {
    const { app, axios } = createApp();
    axios.get = async () => ({ data: [{ title: 'Sang', artist: 'Kunstner' }] });
    await app.searchAlbums();
    assert.equal(app.error, true);
    assert.equal(app.albums.length, 0);
});

test('To numre med samme titel har adskilte favoritter via id', () => {
    const { app } = createApp();
    const first = album();
    const second = { ...first, id: 42 };
    app.toggleFavorite(first);
    assert.equal(app.isFavorite(first), true);
    assert.equal(app.isFavorite(second), false);
});
