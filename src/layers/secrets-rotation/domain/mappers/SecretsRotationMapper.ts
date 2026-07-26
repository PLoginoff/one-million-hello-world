/**
 * SecretsRotationMapper
 */

export interface SecretsRotationDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface SecretsRotationEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class SecretsRotationMapper {
  toDto(entity: SecretsRotationEntityData): SecretsRotationDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: SecretsRotationDto): SecretsRotationEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: SecretsRotationEntityData[]): SecretsRotationDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: SecretsRotationDto[]): SecretsRotationEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: SecretsRotationEntityData, patch: Partial<SecretsRotationEntityData>): SecretsRotationEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
