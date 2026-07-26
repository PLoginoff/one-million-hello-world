/**
 * CanaryDeployMapper
 */

export interface CanaryDeployDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface CanaryDeployEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class CanaryDeployMapper {
  toDto(entity: CanaryDeployEntityData): CanaryDeployDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: CanaryDeployDto): CanaryDeployEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: CanaryDeployEntityData[]): CanaryDeployDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: CanaryDeployDto[]): CanaryDeployEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: CanaryDeployEntityData, patch: Partial<CanaryDeployEntityData>): CanaryDeployEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
