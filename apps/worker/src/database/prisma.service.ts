import {
    Injectable,
    OnModuleDestroy,
    OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
    createPrismaClient,
    type PrismaClient,
} from "@devpilot/database";

@Injectable()
export class PrismaService
    implements OnModuleInit, OnModuleDestroy
{
    readonly client: PrismaClient;

    constructor(configService: ConfigService) {
        const connectionString =
            configService.getOrThrow<string>("DATABASE_URL");

        this.client = createPrismaClient(connectionString);
    }

    async onModuleInit(): Promise<void> {
        await this.client.$connect();
    }

    async onModuleDestroy(): Promise<void> {
        await this.client.$disconnect();
    }
}