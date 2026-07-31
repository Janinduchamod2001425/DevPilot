import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import cookieParser from "cookie-parser";

type CorsCallback = (error: Error | null, allow?: boolean) => void;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  app.use(cookieParser());
  app.enableShutdownHooks();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix("api");

  app.enableCors({
    origin: (origin: string | undefined, callback: CorsCallback): void => {
      if (!origin) {
        callback(null, true);
        return;
      }

      const isLocalhost =
        /^http:\/\/localhost:\d+$/.test(origin) ||
        /^http:\/\/127\.0\.0\.1:\d+$/.test(origin);

      if (isLocalhost) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked origin: ${origin}`), false);
    },
    credentials: true,
  });

  const port = Number(process.env.API_PORT ?? 4000);

  await app.listen(port);

  console.log(`DevPilot API running at http://localhost:${port}/api`);
}

void bootstrap();
