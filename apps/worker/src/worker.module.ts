import { Logger, Module, OnModuleInit } from "@nestjs/common";

@Module({})
export class WorkerModule implements OnModuleInit {
  private readonly logger = new Logger(WorkerModule.name);

  onModuleInit(): void {
    this.logger.log("Deployment worker is ready");
  }
}
