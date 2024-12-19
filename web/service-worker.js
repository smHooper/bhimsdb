/*
Main Service Worker for BHIMS PWA

*/

const VERSON = '1.0.0';
const CACHE_NAME = `cache-v${VERSON}`;
const PRECACHE_RESOURCES = [ 
	'/', 
	'/index.html', 
	'/entry-form.html',
	'/css/bhims.css', 
	'/css/index.css', 
	'/css/entry-form.css',
	'/css/entry-form-dena.css',
	'/imgs/favicon.ico',
	'/flask/db_config',
	'/flask/db/select/locations',
	'/flask/entry_form_config',
	'/flask/environment',
	'/flask/lookup_options',
	'/flask/user_info',
	'https://fonts.googleapis.com/css2?family=Barlow:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&display=swap',
	'https://fonts.gstatic.com/s/barlow/v12/7cHrv4kjgoGqM7E_Cfs7wH8.woff2',
	'https://fonts.gstatic.com/s/barlow/v12/7cHqv4kjgoGqM7E3_-gs51os.woff2',
	'https://fonts.gstatic.com/s/barlow/v12/7cHqv4kjgoGqM7E3t-4s51os.woff2',
	'https://fonts.gstatic.com/s/barlow/v12/7cHsv4kjgoGqM7E_CfOA5WouvTo.woff2',
	'/imgs/arrowhead.svg',
	'/imgs/bhims_dashboard_background.jpg',
	'/imgs/bhims_index_bg_blur_1200.jpg',
	'/imgs/bhims_index_bg_1200.jpg',
	'/imgs/leaflet-layers-icon.png',
	'/imgs/leaflet-marker-icon.png',
	'/imgs/leaflet-marker-icon-2x.png',
	'/imgs/maximize_window_icon_50px.svg',
	'/imgs/minimize_window_icon_50px.svg',
	'/js/bhims.js',
	'/js/entry-form.js',
	'/js/bhims-custom.js',
	'/manifest.json',
	'/packages/bootstrap/bootstrap.4.0.0.min.css',
	'/packages/bootstrap/bootstrap.4.0.0.min.js',
	'/packages/jquery/jquery-3.7.1.min.js',
	'/packages/jquery/jquery-ui.1.12.1.css',
	'/packages/jquery/jquery-ui.1.12.1.min.js',
	'/packages/leaflet/leaflet.1.7.1.css',
	'/packages/leaflet/leaflet.1.7.1.js',
	'/packages/select2/select2.min.css',
	'/packages/select2/select2.min.js',
	'/resources/management_units.json',
	'/resources/mileposts.json',
	'/resources/roads.json'
];

/*
When the service worker is installing, open the cache and add the precache 
resources to it
*/
self.addEventListener('install', e => {
	console.log('[Service Worker] Install event at ' + new Date().toLocaleString());
	e.waitUntil(
		caches.open(CACHE_NAME)
			.then( cache => {
				//cache.addAll(PRECACHE_RESOURCES)
				for (const url of PRECACHE_RESOURCES) {
					cache.add(url)
						.catch(() => console.log(`can't load ${url} to cache`));
					
				}
				// return fetch('/flask/user_info', {method: 'POST'})
				// 	.then(response => {
				// 		if (response.offline_id) {

				// 		}
				// 	})

			})
			
	);
});


/* 
When there's an incoming fetch request, try and respond with a precached 
resource, otherwise fall back to the network
*/
self.addEventListener('fetch', e => {
	
	e.respondWith(
		caches.match(e.request).then( cachedResponse => {
			if (cachedResponse) {
				// console.log('[Service Worker] Fetched cached data for : ' + e.request.url);
				return cachedResponse;
			} else {
				// console.log('[Service Worker] Fetched request for : ' + e.request.url);
				return fetch(e.request);
			}
		}),
	);
});


/* 
When a new Service Worker is activated, delete any old caches
to free up disk space
*/
self.addEventListener('activate', e => {
	console.log('[Service Worker] Activate event');
	e.waitUntil(
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