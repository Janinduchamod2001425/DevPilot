import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class ImportProjectDto {
  @IsString()
  @IsNotEmpty()
  installationId!: string;

  @IsString()
  @IsNotEmpty()
  repositoryId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  rootDirectory!: string;
}
