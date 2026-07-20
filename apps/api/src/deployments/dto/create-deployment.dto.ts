import {
    IsNotEmpty,
    IsString,
} from "class-validator";

export class CreateDeploymentDto {
    @IsString()
    @IsNotEmpty()
    projectId!: string;
}