import { IsNotEmpty, IsString } from "class-validator";

export class ImportProjectDto {
  @IsString()
  @IsNotEmpty()
  installationId!: string;

  @IsString()
  @IsNotEmpty()
  repositoryId!: string;
}
