import { IsNotEmpty, IsString } from "class-validator";

export class UpdateRootDirectoryDto {
  @IsString()
  @IsNotEmpty()
  rootDirectory!: string;
}
