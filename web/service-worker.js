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
	'/imgs/leaflet-marker-shadow.png',
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
	'/packages/leaflet/leaflet.tilelayer.mbtiles.js',
	'/packages/select2/select2.min.css',
	'/packages/select2/select2.min.js',
	'/resources/management_units.json',
	'/resources/mileposts.json',
	'/resources/roads.json'
];
// These also get added to pre-cached resources, but they're large files
//	so we want to show the user their download progress so they know when 
//	it's safe to navigate away from the page
const LARGE_RESOURCES = [
	'/resources/topo.mbtiles'
];


function dispatchProgress({client, resourceName, loaded, total}) {
	// TODO: move messages to broadcast channel
	if (client) {
		client.postMessage({type: 'cache progress', resourceName, loaded, total})
	} else {
		self.clients.matchAll().then(clients => {
		    clients.forEach(client => client.postMessage({type: 'cache progress', resourceName, loaded, total}));
		})
	}
}


function respondWithProgressMonitor(clientId, requestURL, response) {
	if (!response.body) {
		console.warn("ReadableStream is not yet supported in this browser. See https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream")
		return response;
	}
	if (!response.ok) {
		// HTTP error code response
		return response;
	}

	// server must send custom x-file-size header if gzip or other content-encoding is used
	const contentEncoding = response.headers.get('content-encoding');
	const contentLength = response.headers.get(contentEncoding ? 'x-file-size' : 'content-length');
	if (contentLength === null) {
		// don't track download progress if we can't compare against a total size
		console.warn('Response size header unavailable. Cannot measure progress');
		return response;
	}

	let loaded = 0;
	debugReadIterations = 0; // direct correlation to server's response buffer size
	const total = parseInt(contentLength, 10);
	const reader = response.body.getReader();
	const resourceName = requestURL.split('/').pop();

	return new Response(
		new ReadableStream({
			start(controller) {        
				// get client to post message. Awaiting resolution first read() progress
				// is sent for progress indicator accuracy
				let client;
				clients.get(clientId).then(c => {
					client = c;
					read();
				});

				function read() {
					debugReadIterations++;
					reader.read().then(({done, value}) => {
						if (done) {
							console.log('read()', debugReadIterations);
							controller.close();
							return;
						}

						controller.enqueue(value);
						loaded += value.byteLength;
						// console.log('        SW', Math.round(loaded/total*100)+'%');
						dispatchProgress({client, resourceName, loaded, total});
						read();
					})
					.catch(error => {
						// error only typically occurs if network fails mid-download
						client.postMessage({type: 'cache error', resource: resourceName, error: error});
						controller.error(error)
					});
				}
			},

			// Firefox excutes this on page stop, Chrome does not
			cancel(reason) {
				console.log('cancel()', reason);
			}
		})
	)
}


function fetchWithProgressMonitor(e) {
	/*  opaque request responses won't give us access to Content-Length and
	*  Response.body.getReader(), which are required for calculating download
	*  progress.  Respond with a newly-constructed Request from the original Request
	*  that will give us access to those.
	*  See https://stackoverflow.com/questions/39109789/what-limitations-apply-to-opaque-responses

	*  'Access-Control-Allow-Origin' header in the response must not be the
	*  wildcard '*' when the request's credentials mode is 'include'.  We'll omit credentials in this demo.
	*/
	const newRequest = new Request(e.request.clone())//, {
	// 	mode: 'cors',
	// 	credentials: 'omit'
	// });
	return fetch(newRequest).then(response => {
		caches.add(
			respondWithProgressMonitor(
				e.clientId, 
				e.request.url, 
				response
			)
		)
	});
}

// listen for the app to indicate the user wants to download/install
self.addEventListener('message', (e) => {
	if (e.data && e.data.message === 'get large resources') {
		e.source.postMessage({type: 'large resources response', resources: LARGE_RESOURCES});
	}
});


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
				for (const url of [...PRECACHE_RESOURCES, ...LARGE_RESOURCES]) {
					// cache.add(url) 
					// 	.catch(() => console.log(`can't load ${url} to cache`));
					fetch(url).then((response) => {
					  if (!response.ok) {
					    throw new TypeError("bad response status");
					  }
					  return cache.put(url, response);
					});
					
				}
				// TODO: figure out if progress monitoring caching could happen here
				/* something like:
				for (const url of PRECACHE_RESOURCES) {
					...
				} 
				for (const url of LARGE_RESOURCES) {
					// this won't work thought because I need the client ID from the event
					//	unless I can get it from the install event
					//	or I could use a different messaging API like BroadcastChannel
					cache.add(new Request(url).respondWith(....))
				}
				*/
			})
			
	);
});


/* 
When there's an incoming fetch request, try and respond with a precached 
resource, otherwise fall back to the network
*/
self.addEventListener('fetch', e => {
	const requestURL = e.request.url.replace(self.location.origin, '');
	e.respondWith(
		caches.match(e.request).then( cachedResponse => {
			console.log('[Service Worker] Fetching ' + requestURL);
			if (cachedResponse) {
				// console.log('[Service Worker] Fetched cached data for : ' + e.request.url);
				dispatchProgress({resourceName: requestURL, loaded: 1, total: 1})
				return cachedResponse;
			} else if (LARGE_RESOURCES.includes(requestURL)) {
				console.log('[Service Worker] Fetching large resource with progress: ' + e.request.url);
				fetchWithProgressMonitor(e)
			}
			else {
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