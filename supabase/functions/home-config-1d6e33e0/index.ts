import { Hono } from 'npm:hono';
import { cors } from 'npm:hono/cors';
import { logger } from 'npm:hono/logger';
import { adminMiddleware } from '../server/admin-auth.tsx';
import { homeConfigAdmin, homeConfigPublic, homePagePublic } from '../server/home-admin.tsx';
import { adminBanners, publicBanners } from '../server/banners.tsx';

const app = new Hono();

app.use('*', cors());
app.use('*', logger());

app.use('/home-config-1d6e33e0/admin/*', adminMiddleware);
app.route('/home-config-1d6e33e0/admin/banners', adminBanners);
app.route('/home-config-1d6e33e0/admin', homeConfigAdmin);
app.route('/home-config-1d6e33e0/banners', publicBanners);
app.route('/home-config-1d6e33e0/home-page', homePagePublic);
app.route('/home-config-1d6e33e0', homeConfigPublic);

Deno.serve(app.fetch);
