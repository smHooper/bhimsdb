/*
Main Service Worker for BHIMS PWA

*/

const VERSON = '1.0.0';
const CACHE_NAME = `cache-v${VERSON}`;
const PRECACHE_RESOURCES = [ 
	'/', 
	'/index.html', 
	'/entry-form.html',
	'/flask/environment',
	'/flask/db_config',
	'/flask/field_entry_config',
	'/flask/user_info',
	'/js/bhims.js', 
	'/js/index.js', 
	'/js/entry-form.js',
	'/js/bhims-custom.js',
	'/css/bhims.css', 
	'/css/index.css', 
	'/css/entry-form.css',
	'/css/entry-form-dena.css'
	'/imgs/bhims_dashboard_background.jpg',
	'/imgs/bhims_index_bg_blur_1200.jpg',
	'/imgs/maximize_window_icon_50px.svg',
	'/imgs/minimize_window_icon_50px.svg',
	'/imgs/leaflet-layers-icon.png',
	'/imgs/leaflet-marker-icon.png',
	'/imgs/leaflet-marker-icon-2x.png',
	'/packages/bootstrap/bootstrap.4.0.0.min.css',
	'/packages/bootstrap/bootstrap.4.0.0.min.js',
	'/packages/jquery/jquery-3.7.1.min.js',
	'/packages/leaflet/leaflet.1.7.1.css',
	'/packages/leaflet/leaflet.1.7.1.js',
	'/packages/select2/select2.min.css',
	'/packages/select2/select2.min.js'
];

/*
When the service worker is installing, open the cache and add the precache 
resources to it
*/
self.addEventListener('install', (e) => {
	console.log('[Service Worker] Install event');
	e.waitUntil(
		caches.open(CACHE_NAME)
			.then( cache => cache.addAll(PRECACHE_RESOURCES))
	);
});


/* 
When there's an incoming fetch request, try and respond with a precached 
resource, otherwise fall back to the network
*/
self.addEventListener('fetch', (e) => {
	console.log('[Service Worker] Fetch intercepted for: ' + e.request.url);
	e.respondWith(
		caches.match(e.request).then( cachedResponse => {
			if (cachedResponse) {
				return cachedResponse;
			}
			return fetch(e.request);
		}),
	);
});


/* 
When a new Service Worker is activated, delete any old caches
to free up disk space
*/
self.addEventListener('activate', (event) => {
	console.log('[Service Worker] Activate event');
	event.waitUntil(
		(async () => {
			const names = await caches.keys();
			await Promise.all(
				names.map((name) => {
					if (name !== CACHE_NAME) {
						return caches.delete(name);
					}
				}),
			);
			// Set current worker as controller of the client
			await clients.claim();
		})(),
	);
});