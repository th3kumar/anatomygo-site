/** AnatomyGo is in closed testing, so its Play listing is visible only to testers and shows "not found" to
 * everyone else. Set to true at the public launch to bring back the Play buttons on both pages. */
export const PLAY_PUBLIC=false;

/** The Play listing, tagged so the app's Firebase attributes installs to the page that sent them. */
export const playUrl=(source:string)=>`https://play.google.com/store/apps/details?id=com.anatomygo&referrer=${encodeURIComponent(`utm_source=${source}&utm_medium=web`)}`;
