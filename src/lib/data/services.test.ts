import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listActiveServicesForBranch,
  listServicesForCatalog,
  updateServiceAvailability,
  getServiceById,
  listRecentMovementsForService,
  updateService,
  createService,
  uploadServiceImage,
  getServiceImagePublicUrl,
} from './services';

let lastTable: string | null = null;
let lastSelectArgs: unknown = null;
let lastOrFilter: string | null = null;
let lastEqArgs: [string, unknown] | null = null;
let lastIsArgs: [string, unknown] | null = null;
let lastOrderArgs: [string, unknown] | null = null;
let lastUpdateArgs: unknown = null;
let lastInsertArgs: unknown = null;
let lastLimitArg: number | null = null;
let lastStorageBucket: string | null = null;
let lastUploadArgs: [string, unknown] | null = null;
let lastGetPublicUrlArg: string | null = null;
let resolvedValue: unknown = { data: [], error: null };

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      lastTable = table;
      const mock: Record<string, unknown> = {};
      mock.select = (...args: unknown[]) => {
        lastSelectArgs = args[0];
        return mock;
      };
      mock.or = (filter: string) => {
        lastOrFilter = filter;
        return mock;
      };
      mock.eq = (field: string, value: unknown) => {
        lastEqArgs = [field, value];
        return mock;
      };
      mock.is = (field: string, value: unknown) => {
        lastIsArgs = [field, value];
        return mock;
      };
      mock.order = (field: string, opts?: unknown) => {
        lastOrderArgs = [field, opts];
        return mock;
      };
      mock.limit = (n: number) => {
        lastLimitArg = n;
        return Promise.resolve(resolvedValue);
      };
      mock.update = (payload: unknown) => {
        lastUpdateArgs = payload;
        return mock;
      };
      mock.insert = (payload: unknown) => {
        lastInsertArgs = payload;
        return mock;
      };
      mock.single = () => Promise.resolve(resolvedValue);
      // Terminal for plain .eq()/.order() chains that end without
      // .single()/.limit().
      mock.then = (resolve: (v: unknown) => unknown) => Promise.resolve(resolvedValue).then(resolve);
      return mock;
    },
    storage: {
      from: (bucket: string) => {
        lastStorageBucket = bucket;
        return {
          upload: (path: string, file: unknown) => {
            lastUploadArgs = [path, file];
            return Promise.resolve(resolvedValue);
          },
          getPublicUrl: (path: string) => {
            lastGetPublicUrlArg = path;
            return { data: { publicUrl: `https://example.test/${path}` } };
          },
        };
      },
    },
  }),
}));

beforeEach(() => {
  lastTable = null;
  lastSelectArgs = null;
  lastOrFilter = null;
  lastEqArgs = null;
  lastIsArgs = null;
  lastOrderArgs = null;
  lastUpdateArgs = null;
  lastInsertArgs = null;
  lastLimitArg = null;
  lastStorageBucket = null;
  lastUploadArgs = null;
  lastGetPublicUrlArg = null;
  resolvedValue = { data: [], error: null };
});

describe('listActiveServicesForBranch (unchanged pre-existing function)', () => {
  it('filters active + available services scoped to the branch (or global)', async () => {
    await listActiveServicesForBranch('branch-1');
    expect(lastTable).toBe('services');
    expect(lastOrFilter).toBe('branch_id.eq.branch-1,branch_id.is.null');
  });
});

describe('listServicesForCatalog (ServicesPage)', () => {
  it('scopes to branch + global when a branch is selected', async () => {
    await listServicesForCatalog('branch-1');
    expect(lastTable).toBe('services');
    expect(lastEqArgs).toEqual(['is_active', true]);
    expect(lastOrFilter).toBe('branch_id.eq.branch-1,branch_id.is.null');
    expect(lastIsArgs).toBeNull();
  });

  it('falls back to only global services when no branch is selected', async () => {
    await listServicesForCatalog(null);
    expect(lastOrFilter).toBeNull();
    expect(lastIsArgs).toEqual(['branch_id', null]);
  });

  it('orders by name', async () => {
    await listServicesForCatalog('branch-1');
    expect(lastOrderArgs?.[0]).toBe('name');
  });
});

describe('updateServiceAvailability (ServicesPage toggle)', () => {
  it('updates is_available for the given service id', async () => {
    await updateServiceAvailability('service-1', false);
    expect(lastTable).toBe('services');
    expect(lastUpdateArgs).toEqual({ is_available: false });
    expect(lastEqArgs).toEqual(['id', 'service-1']);
  });
});

describe('getServiceById (ServiceDetailPage + ServiceEditSheet)', () => {
  it('selects a single service by id with the given column set', async () => {
    await getServiceById('service-1', 'id, name, price, cost, is_active, created_at, branch_id');
    expect(lastTable).toBe('services');
    expect(lastSelectArgs).toBe('id, name, price, cost, is_active, created_at, branch_id');
    expect(lastEqArgs).toEqual(['id', 'service-1']);
  });
});

describe('listRecentMovementsForService (ServiceDetailPage "Ventas recientes")', () => {
  it('queries servicio-type movements for the service, newest first, capped at 20', async () => {
    await listRecentMovementsForService('service-1');
    expect(lastTable).toBe('movements');
    expect(lastEqArgs).toEqual(['type', 'servicio']);
    expect(lastOrderArgs?.[0]).toBe('created_at');
    expect((lastOrderArgs?.[1] as { ascending: boolean }).ascending).toBe(false);
    expect(lastLimitArg).toBe(20);
  });
});

describe('updateService (ServiceEditSheet edit path)', () => {
  it('updates the services row by id with the given payload', async () => {
    const payload = {
      name: 'Corte',
      price: 50000,
      cost: 10000,
      description: null,
      image_url: null,
      category: null,
      is_available: true,
      branch_id: 'branch-1',
    };
    await updateService('service-1', payload);
    expect(lastTable).toBe('services');
    expect(lastUpdateArgs).toEqual(payload);
    expect(lastEqArgs).toEqual(['id', 'service-1']);
  });
});

describe('createService (ServiceForm create path)', () => {
  it('inserts a new services row', async () => {
    const payload = {
      name: 'Corte',
      price: 50000,
      cost: 0,
      is_active: true,
      branch_id: 'branch-1',
      description: null,
      image_url: null,
      category: null,
      is_available: true,
    };
    await createService(payload);
    expect(lastTable).toBe('services');
    expect(lastInsertArgs).toEqual(payload);
  });
});

describe('uploadServiceImage (ServiceForm/ServiceEditSheet image upload)', () => {
  it('uploads to the service-images bucket at the given path', async () => {
    const file = { name: 'photo.png' };
    await uploadServiceImage('branch-1/uuid-photo.png', file);
    expect(lastStorageBucket).toBe('service-images');
    expect(lastUploadArgs).toEqual(['branch-1/uuid-photo.png', file]);
  });
});

describe('getServiceImagePublicUrl (ServiceForm/ServiceEditSheet image upload)', () => {
  it('returns the public URL for the given path', () => {
    const result = getServiceImagePublicUrl('branch-1/uuid-photo.png');
    expect(lastStorageBucket).toBe('service-images');
    expect(lastGetPublicUrlArg).toBe('branch-1/uuid-photo.png');
    expect(result.data.publicUrl).toBe('https://example.test/branch-1/uuid-photo.png');
  });
});
