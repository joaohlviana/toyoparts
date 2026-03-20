import { expect, test, type Page } from '@playwright/test';

type CollectedIssues = {
  consoleErrors: string[];
  pageErrors: string[];
};

const categoryTree = {
  id: 1,
  parent_id: 0,
  name: 'Root Catalog',
  level: 0,
  is_active: true,
  product_count: 0,
  children_data: [
    {
      id: 10,
      parent_id: 1,
      name: 'Pecas',
      level: 1,
      is_active: true,
      product_count: 12,
      children_data: [
        {
          id: 11,
          parent_id: 10,
          name: 'Filtros',
          level: 2,
          is_active: true,
          product_count: 6,
          children_data: [],
        },
      ],
    },
    {
      id: 20,
      parent_id: 1,
      name: 'Acessorios',
      level: 1,
      is_active: true,
      product_count: 8,
      children_data: [],
    },
  ],
};

const sampleHits = [
  {
    id: '1',
    sku: 'TOYO-001',
    name: 'Filtro de Oleo Toyota Hilux',
    seo_title: 'Filtro de Oleo Toyota Hilux',
    price: 199.9,
    special_price: 149.9,
    in_stock: true,
    image_url: 'https://images.unsplash.com/photo-1487754180451-c456f719a1fc?auto=format&fit=crop&w=600&q=80',
    url_key: 'filtro-de-oleo-toyota-hilux',
    modelos: ['Hilux'],
    anos: ['2022'],
    category_ids: ['11'],
    category_names: ['Filtros'],
  },
  {
    id: '2',
    sku: 'TOYO-002',
    name: 'Pastilha de Freio Corolla',
    seo_title: 'Pastilha de Freio Corolla',
    price: 399.9,
    special_price: null,
    in_stock: true,
    image_url: 'https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?auto=format&fit=crop&w=600&q=80',
    url_key: 'pastilha-de-freio-corolla',
    modelos: ['Corolla'],
    anos: ['2023'],
    category_ids: ['10'],
    category_names: ['Pecas'],
  },
];

function buildSearchResponse(query: string | null) {
  const normalizedQuery = (query || '').toLowerCase();
  const hits = normalizedQuery.includes('filtro')
    ? sampleHits.filter((item) => item.name.toLowerCase().includes('filtro'))
    : sampleHits;

  return {
    engine: 'meilisearch',
    mode: 'instant',
    query: query || '',
    originalQuery: query || '',
    aiExpansion: null,
    hits,
    totalHits: hits.length,
    facetDistribution: {
      category_names: {
        Pecas: 2,
        Filtros: 1,
        Acessorios: 1,
      },
      category_ids: {
        '10': 2,
        '11': 1,
        '20': 1,
      },
      modelos: {
        Hilux: 1,
        Corolla: 1,
      },
      anos: {
        '2022': 1,
        '2023': 1,
      },
    },
    processingTimeMs: 12,
    totalTimeMs: 18,
    limit: hits.length,
    offset: 0,
  };
}

async function installApiMocks(page: Page) {
  await page.route('**/functions/v1/make-server-1d6e33e0/**', async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;

    if (pathname.endsWith('/search')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildSearchResponse(url.searchParams.get('q'))),
      });
    }

    if (pathname.endsWith('/categories/tree')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(categoryTree),
      });
    }

    if (pathname.endsWith('/categories/images')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ filtros: sampleHits[0].image_url }),
      });
    }

    if (pathname.endsWith('/banners')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ banners: [] }),
      });
    }

    if (pathname.includes('/si/intelligence/trending')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          trending: [
            { term: 'filtro de oleo' },
            { term: 'pastilha corolla' },
            { term: 'amortecedor hilux' },
          ],
        }),
      });
    }

    if (pathname.includes('/si/track/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });
}

function attachIssueCollectors(page: Page): CollectedIssues {
  const issues: CollectedIssues = { consoleErrors: [], pageErrors: [] };

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      issues.consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', (error) => {
    issues.pageErrors.push(error.message);
  });

  return issues;
}

async function expectNoCriticalIssues(issues: CollectedIssues) {
  expect.soft(
    issues.consoleErrors,
    `Console errors detected:\n${issues.consoleErrors.join('\n')}`,
  ).toEqual([]);
  expect.soft(
    issues.pageErrors,
    `Page errors detected:\n${issues.pageErrors.join('\n')}`,
  ).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await installApiMocks(page);
});

test.describe('Toyoparts smoke suite', () => {
  test('homepage SEO and critical UI load correctly', async ({ page }) => {
    const issues = attachIssueCollectors(page);

    await page.goto('/', { waitUntil: 'networkidle' });

    await expect(page).toHaveTitle('Toyoparts | Pecas e Acessorios Genuinos Toyota');
    await expect(page.locator('link[rel="icon"]').first()).toHaveAttribute('href', '/favicon.svg');
    await expect(page.locator('link[rel="canonical"]').first()).toHaveAttribute('href', 'https://www.toyoparts.com.br/');
    await expect(page.locator('meta[name="description"]').first()).toHaveAttribute('content', /Toyota/i);
    await expect(page.locator('h1').first()).toContainText('Toyoparts');

    await expectNoCriticalIssues(issues);
  });

  test('main content pages load without runtime errors', async ({ page }) => {
    const routes = [
      '/',
      '/sobre',
      '/politica-de-privacidade',
      '/politica-de-entrega',
      '/trocas-e-devolucoes',
      '/rastreamento',
      '/busca?q=filtro',
      '/pecas/corolla',
    ];

    const issues = attachIssueCollectors(page);

    for (const route of routes) {
      await page.goto(route, { waitUntil: 'networkidle' });
      await expect(page.locator('body')).toBeVisible();
    }

    await expectNoCriticalIssues(issues);
  });

  test('search from homepage navigates to results', async ({ page }) => {
    const issues = attachIssueCollectors(page);

    await page.goto('/', { waitUntil: 'networkidle' });
    const searchInput = page.locator('input:visible').first();
    await searchInput.fill('filtro');
    await searchInput.press('Enter');

    await expect(page).toHaveURL(/\/busca\?q=filtro/);
    await expect(page.locator('body')).toContainText(/filtro/i);
    await expectNoCriticalIssues(issues);
  });

  test('product sliders advance one card at a time on desktop', async ({ page, browserName, isMobile }) => {
    test.skip(browserName !== 'chromium' || isMobile, 'Desktop-only slider stepping check');

    const issues = attachIssueCollectors(page);
    await page.goto('/', { waitUntil: 'networkidle' });

    const sliderIndex = await page.locator('[class*="group/slider"]').evaluateAll((nodes) => {
      return nodes.findIndex((node) => {
        const track = node.querySelector('.no-scrollbar');
        if (!(track instanceof HTMLElement)) return false;
        return track.scrollWidth > track.clientWidth + 8;
      });
    });

    expect(sliderIndex).toBeGreaterThanOrEqual(0);

    const sliderRoot = page.locator('[class*="group/slider"]').nth(sliderIndex);
    const sliderTrack = sliderRoot.locator('.no-scrollbar');
    const nextButton = sliderRoot.getByRole('button', { name: /proximo/i });

    const before = await sliderTrack.evaluate((el) => {
      const firstItem = el.firstElementChild as HTMLElement | null;
      const gap = Number.parseFloat(getComputedStyle(el).gap || '0') || 0;
      return {
        scrollLeft: el.scrollLeft,
        itemWidth: firstItem?.getBoundingClientRect().width ?? 0,
        gap,
      };
    });

    await nextButton.evaluate((button: HTMLButtonElement) => button.click());
    await page.waitForTimeout(700);

    const after = await sliderTrack.evaluate((el) => el.scrollLeft);
    const expectedStep = before.itemWidth + before.gap;

    expect(after).toBeGreaterThan(0);
    expect(Math.abs(after - expectedStep)).toBeLessThanOrEqual(24);
    await expectNoCriticalIssues(issues);
  });

  test('hero advances one banner at a time on desktop', async ({ page, browserName, isMobile }) => {
    test.skip(browserName !== 'chromium' || isMobile, 'Desktop-only hero stepping check');

    const issues = attachIssueCollectors(page);
    await page.goto('/', { waitUntil: 'networkidle' });

    const carousel = page.locator('.group\\/carousel').first();
    const carouselTrack = carousel.locator('> div').first();
    await expect(carouselTrack).toBeVisible();

    const nextButton = carousel.locator('button').nth(1);
    const before = await carouselTrack.evaluate((el) => ({
      scrollLeft: el.scrollLeft,
      clientWidth: el.clientWidth,
    }));

    await carousel.hover();
    await expect(nextButton).toBeVisible();
    await nextButton.click();
    await page.waitForTimeout(800);

    const after = await carouselTrack.evaluate((el) => el.scrollLeft);
    expect(after).toBeGreaterThan(0);
    expect(Math.abs(after - (before.scrollLeft + before.clientWidth))).toBeLessThanOrEqual(24);
    await expectNoCriticalIssues(issues);
  });

  test('hero responds to swipe one banner at a time on mobile', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile-only hero swipe check');

    const issues = attachIssueCollectors(page);
    await page.goto('/', { waitUntil: 'networkidle' });

    const carousel = page.locator('.group\\/carousel').first();
    const carouselTrack = carousel.locator('> div').first();
    await expect(carouselTrack).toBeVisible();

    const before = await carouselTrack.evaluate((el) => ({
      scrollLeft: el.scrollLeft,
      clientWidth: el.clientWidth,
    }));

    await carousel.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const startX = rect.left + rect.width * 0.8;
      const endX = rect.left + rect.width * 0.25;
      const y = rect.top + rect.height * 0.5;

      const makeTouch = (clientX: number) =>
        new Touch({
          identifier: 1,
          target: el,
          clientX,
          clientY: y,
          radiusX: 2,
          radiusY: 2,
          rotationAngle: 0,
          force: 0.5,
        });

      const startTouch = makeTouch(startX);
      const endTouch = makeTouch(endX);

      el.dispatchEvent(new TouchEvent('touchstart', {
        bubbles: true,
        cancelable: true,
        touches: [startTouch],
        targetTouches: [startTouch],
        changedTouches: [startTouch],
      }));
      el.dispatchEvent(new TouchEvent('touchmove', {
        bubbles: true,
        cancelable: true,
        touches: [endTouch],
        targetTouches: [endTouch],
        changedTouches: [endTouch],
      }));
      el.dispatchEvent(new TouchEvent('touchend', {
        bubbles: true,
        cancelable: true,
        touches: [],
        targetTouches: [],
        changedTouches: [endTouch],
      }));
    });

    await page.waitForTimeout(800);

    const after = await carouselTrack.evaluate((el) => el.scrollLeft);
    expect(after).toBeGreaterThan(0);
    expect(Math.abs(after - (before.scrollLeft + before.clientWidth))).toBeLessThanOrEqual(28);
    await expectNoCriticalIssues(issues);
  });
});
