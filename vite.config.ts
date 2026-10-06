import {fileURLToPath} from 'node:url';
import {defineConfig,loadEnv} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
const path=(relative:string)=>fileURLToPath(new URL(relative,import.meta.url));
export default defineConfig(({mode})=>{const env=loadEnv(mode,path('./playground'),'VITE_');if(env.VITE_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_secret_'))throw Error('Use only a publishable key');return {define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify(env.VITE_SUPABASE_URL??''),'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':JSON.stringify(env.VITE_SUPABASE_PUBLISHABLE_KEY??'')},root:path('./web'),publicDir:path('./public'),plugins:[react()],resolve:{alias:{'@':path('./')}},css:{postcss:{plugins:[tailwindcss()]}},server:{watch:{usePolling:true}},build:{outDir:path('./dist'),emptyOutDir:true,rolldownOptions:{input:{main:path('./web/index.html'),share:path('./web/v/index.html')}}}};});
