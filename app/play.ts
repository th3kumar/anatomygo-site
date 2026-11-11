/** AnatomyGo is public on Google Play (since October 2026). Setting this to false hides every Play button again,
 * on both pages, and the homepage's "new app" badge with them. */
export const PLAY_PUBLIC=true;

/** The Play listing, tagged so the app's Firebase attributes installs to the page that sent them. public/app-qr.svg
 * encodes playUrl('site_qr'); regenerate it if this address changes. */
export const playUrl=(source:string)=>`https://play.google.com/store/apps/details?id=com.anatomygo&referrer=${encodeURIComponent(`utm_source=${source}&utm_medium=web`)}`;

const ua=typeof navigator==='object'?navigator.userAgent:'';
/** iPadOS reports itself as a Mac, so a Mac with a touch screen counts as Apple too. */
export const platform:'android'|'ios'|'other'=/Android/i.test(ua)?'android':/iPhone|iPad|iPod/i.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1)?'ios':'other';

/** Set once the visitor has opened About after the launch; until then the About button carries a badge. */
export const APP_SEEN='anatomygo.about.app';

/** Who the loading card's link to the app is for, when its switch is on (site_flags `android_app_loading`, read in
 * app/page.tsx; off by default). Of Android visitors in Africa and in Asia outside its richest countries, 12 of 148
 * pressed the Play button; everywhere else, 0 of 296 did (BigQuery, 2-10 Nov 2026): data is dear there, the download is
 * slow, and the app works offline. The region is read from the device's own time zone and never sent. */
export const appAudience=PLAY_PUBLIC&&platform==='android'&&(()=>{try{return /^(Africa|Indian)\/|^Asia\/(?!Tokyo|Seoul|Shanghai|Chongqing|Harbin|Urumqi|Hong_Kong|Macau|Taipei|Singapore)/.test(Intl.DateTimeFormat().resolvedOptions().timeZone);}catch{return false;}})();
