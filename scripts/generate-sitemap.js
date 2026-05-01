import Database from 'better-sqlite3';
import { writeFileSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DB_PATH = resolve(ROOT, 'public/audiodb.web.sqlite');
const OUT_PATH = resolve(ROOT, 'public/sitemap.xml');
const BASE_URL = 'https://audiospecs.frieve.com';

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const dbMtime = statSync(DB_PATH).mtime.toISOString().split('T')[0];

const db = new Database(DB_PATH, { readonly: true });
const products = db.prepare(
  'SELECT brand_name_en, product_name FROM web_product_core ORDER BY brand_name_en, product_name'
).all();
db.close();

const staticPages = [
  { path: '/',        priority: '1.0', changefreq: 'weekly' },
  { path: '/analysis', priority: '0.8', changefreq: 'weekly' },
  { path: '/explore',  priority: '0.8', changefreq: 'weekly' },
  { path: '/compare',  priority: '0.6', changefreq: 'monthly' },
  { path: '/about',    priority: '0.5', changefreq: 'monthly' },
];

function urlEntry({ loc, lastmod, changefreq, priority }) {
  return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

const entries = [
  ...staticPages.map(p =>
    urlEntry({ loc: `${BASE_URL}${p.path}`, lastmod: dbMtime, changefreq: p.changefreq, priority: p.priority })
  ),
  ...products.map(r => {
    const brand = slugify(r.brand_name_en || 'unknown');
    const product = slugify(r.product_name);
    return urlEntry({
      loc: `${BASE_URL}/product/${brand}/${product}`,
      lastmod: dbMtime,
      changefreq: 'monthly',
      priority: '0.7',
    });
  }),
];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>
`;

writeFileSync(OUT_PATH, xml, 'utf-8');
console.log(`sitemap.xml generated: ${entries.length} URLs (${products.length} products)`);
