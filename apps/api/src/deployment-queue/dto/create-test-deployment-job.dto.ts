import {
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUrl,
} from "class-validator";

export class CreateTestDeploymentJobDto {
    @IsUrl({
        require_protocol: true,
        protocols: ["https"],
    })
    repositoryUrl!: string;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    branch: string = "main";
}