// Fails when an analytics event the site sent before the revamp is no longer sent anywhere in the source.
// GA reports, the behaviour board and saved comparisons depend on these names; renaming one silently breaks them.
// Add a name here when you add an event; remove one only on purpose, with a note in the commit.
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join,extname} from 'node:path';

const REQUIRED=`
about_opened admin_action app_badge_shown appearance_changed atlas_download_failed atlas_load_interrupted atlas_load_restarted
atlas_outer_ready atlas_ready camera_view comment_deleted comment_posted comments_opened display_toggled draft_cancelled
draft_started explode_used feature_opened feedback_dismissed feedback_failed feedback_opened feedback_prompt_shown feedback_sent
finder_choice finder_opened google_button_unavailable hint_dismissed hint_shown home_pin_selected home_pins_offered
home_pins_shown home_tip_dismissed home_tip_shown lighting_closed lighting_opened lighting_reset list_toggled loading_tap
open_in_app_clicked pin_alternative_viewed pin_deleted pin_placed pin_refused pin_saved pin_shared play_clicked playground_error
playground_exit playground_opened playground_view practice_completed practice_offer_accepted practice_offer_dismissed
practice_offer_shown practice_skipped practice_started practice_step preset_applied public_name_prompted public_name_set
render_perf renderer_failed report_sent search_abandoned search_no_result search_performed share_link_invalid share_link_opened
share_nudge_dismissed share_nudge_shown shared_pin_opened shared_pin_revealed sign_in_completed sign_in_failed
sign_in_fallback_opened sign_in_prompted sign_in_started signed_out structure_isolated structure_opened structure_selected
system_toggled view_in_3d_clicked view_reset visit_summary vote_cast webgl_unavailable
about_closed contribute_closed feature_closed report_opened search_opened source_opened structure_closed
`.trim().split(/\s+/);

const ROOTS=['app','web','playground/src','lib'],EXT=new Set(['.ts','.tsx','.js','.mjs']);
const files=[];
const walk=dir=>{for(const name of readdirSync(dir)){const p=join(dir,name);if(statSync(p).isDirectory()){if(name!=='node_modules')walk(p);}else if(EXT.has(extname(p))&&!/\.test\./.test(p))files.push(p);}};
ROOTS.forEach(walk);
const source=files.map(f=>readFileSync(f,'utf8')).join('\n');
const missing=REQUIRED.filter(name=>!new RegExp(`['"\`]${name}['"\`]`).test(source));
if(missing.length){console.error(`Analytics events no longer sent: ${missing.join(', ')}`);process.exit(1);}
console.log(`Analytics: all ${REQUIRED.length} events still sent.`);
