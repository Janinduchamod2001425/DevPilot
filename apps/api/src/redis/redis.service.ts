import {
    Injectable,
    Logger,
    OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";

@Injectable()
export class RedisService implements OnModuleDestroy {
    private readonly logger = new Logger(RedisService.name);
    private readonly client: Redis;

    constructor(configService: ConfigService) {
        const host =
            configService.get<string>("REDIS_HOST") ??
            "localhost";

        const port = Number(
            configService.get<string>("REDIS_PORT") ??
            6380,
        );

        this.client = new Redis({
            host,
            port,
            connectTimeout: 2000,
            maxRetriesPerRequest: 1,

            retryStrategy: (attempt: number): number => {
                return Math.min(attempt * 200, 2000);
            },
        });

        this.client.on("error", (error: Error) => {
            this.logger.warn(
                `Redis connection error: ${error.message}`,
            );
        });
    }

    async checkConnection(): Promise<boolean> {
        try {
            const response = await Promise.race([
                this.client.ping(),

                new Promise<never>((_, reject) => {
                    setTimeout(() => {
                        reject(
                            new Error("Redis health check timed out"),
                        );
                    }, 2000);
                }),
            ]);

            return response === "PONG";
        } catch {
            return false;
        }
    }

    async onModuleDestroy(): Promise<void> {
        if (this.client.status === "ready") {
            await this.client.quit();
            return;
        }

        this.client.disconnect();
    }
}