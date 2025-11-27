import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { FindPhoneUseCase } from '../usecases/findPhoneUseCase';
import { ProviderSelectionPipeline } from '../../domain/services/ProviderSelectionPipeline';
import { RateLimitProviderFilter } from '../../domain/services/filters/RateLimitProviderFilter';
import { UserTierProviderFilter } from '../../domain/services/filters/UserTierProviderFilter';
import { EnabledProviderFilter } from '../../domain/services/filters/EnabledProviderFilter';
import { InMemoryRateLimitStore } from '../../infrastructure/rate-limit/InMemoryRateLimitStore';
import { ProviderConfig, UserTier } from '../../domain/models/ProviderConfig';
import { ProviderName } from '../../domain/value-objects/ProviderName';
import { IPhoneProvider, PhoneSearchParams } from '../../domain/ports/IPhoneProvider';

// Fake providers for API test
class FakeAstraDialer implements IPhoneProvider {
    name = ProviderName.ASTRA_DIALER;
    async findPhone(params: PhoneSearchParams) {
        if (params.fullName === 'John Doe') {
            return { phone: '+1234567890', countryCode: 'US' };
        }
        return null;
    }
}

class FakeNimbusLookup implements IPhoneProvider {
    name = ProviderName.NIMBUS_LOOKUP;
    async findPhone(params: PhoneSearchParams) {
        if (params.fullName === 'Jane Smith') {
            return { phone: '+9876543210', countryCode: 'UK' };
        }
        return null;
    }
}

const providerConfigs: ProviderConfig[] = [
    {
        name: ProviderName.ASTRA_DIALER,
        enabled: true,
        priority: 10,
        rateLimit: { maxRequestsPerHour: 300 },
        minUserTier: UserTier.FREE,
    },
    {
        name: ProviderName.NIMBUS_LOOKUP,
        enabled: true,
        priority: 5,
        rateLimit: { maxRequestsPerHour: 600 },
        minUserTier: UserTier.BASIC,
    },
];

const providerMap = new Map([
    [ProviderName.ASTRA_DIALER, new FakeAstraDialer()],
    [ProviderName.NIMBUS_LOOKUP, new FakeNimbusLookup()],
]);

describe('API Endpoint - /api/find-phone [integration]', () => {
    let app: express.Express;
    let useCase: FindPhoneUseCase;

    beforeAll(() => {
        const rateLimitStore = new InMemoryRateLimitStore();
        const pipeline = new ProviderSelectionPipeline()
            .addFilter(new EnabledProviderFilter())
            .addFilter(new UserTierProviderFilter())
            .addFilter(new RateLimitProviderFilter(rateLimitStore));
        useCase = new FindPhoneUseCase(providerMap, providerConfigs, pipeline);

        app = express();
        app.use(express.json());
        app.post('/api/find-phone', async (req, res) => {
            const { fullName, email, userId, userTier } = req.body;
            const result = await useCase.execute(
                { fullName, email },
                { userId, userTier }
            );
            if (result) {
                res.json(result);
            } else {
                res.status(404).json({ error: 'Phone not found' });
            }
        });
    });

    it('should return phone for valid user and lead', async () => {
        const response = await request(app)
            .post('/api/find-phone')
            .send({ fullName: 'John Doe', email: 'john@example.com', userId: 'user-1', userTier: UserTier.FREE });
        expect(response.status).toBe(200);
        expect(response.body.phone).toBe('+1234567890');
        expect(response.body.provider).toBe(ProviderName.ASTRA_DIALER);
    });

    it('should cascade to next provider if first fails', async () => {
        const response = await request(app)
            .post('/api/find-phone')
            .send({ fullName: 'Jane Smith', email: 'jane@example.com', userId: 'user-2', userTier: UserTier.BASIC });
        expect(response.status).toBe(200);
        expect(response.body.phone).toBe('+9876543210');
        expect(response.body.provider).toBe(ProviderName.NIMBUS_LOOKUP);
    });

    it('should return 404 if no provider finds phone', async () => {
        const response = await request(app)
            .post('/api/find-phone')
            .send({ fullName: 'Unknown Person', email: 'unknown@example.com', userId: 'user-3', userTier: UserTier.FREE });
        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Phone not found');
    });
});
