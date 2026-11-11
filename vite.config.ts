import {fileURLToPath} from 'node:url';
import {defineConfig,loadEnv} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
const path=(relative:string)=>fileURLToPath(new URL(relative,import.meta.url));
// This build's id: the commit on a deploy, the time of the build otherwise. It is compiled into the app and written to
// /version.json, so a tab that has been open since an older build can tell a newer one is live (app/update.ts).
const BUILD=process.env.GITHUB_SHA?.slice(0,12)??`local-${Date.now().toString(36)}`;
export default defineConfig(({mode})=>{const env=loadEnv(mode,path('./playground'),'VITE_');if(env.VITE_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_secret_'))throw Error('Use only a publishable key');return {define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify(env.VITE_SUPABASE_URL??''),'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':JSON.stringify(env.VITE_SUPABASE_PUBLISHABLE_KEY??''),'import.meta.env.VITE_GOOGLE_CLIENT_ID':JSON.stringify(env.VITE_GOOGLE_CLIENT_ID??''),'import.meta.env.VITE_BUILD':JSON.stringify(BUILD)},root:path('./web'),publicDir:path('./public'),plugins:[react(),{name:'version-file',generateBundle(){this.emitFile({type:'asset',fileName:'version.json',source:JSON.stringify({build:BUILD})});}}],resolve:{alias:{'@':path('./')}},css:{postcss:{plugins:[tailwindcss()]}},server:{watch:{usePolling:true}},build:{outDir:path('./dist'),emptyOutDir:true,rolldownOptions:{input:{main:path('./web/index.html'),share:path('./web/v/index.html'),whatsNew:path('./web/whats-new/index.html'),anatomy:path('./web/anatomy/index.html'),privacy:path('./web/privacy/index.html'),terms:path('./web/terms/index.html'),deleteAccount:path('./web/delete-account/index.html'),notFound:path('./web/404.html')}}}};});
