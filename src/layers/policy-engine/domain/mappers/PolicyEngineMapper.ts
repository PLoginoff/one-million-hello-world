/**
 * PolicyEngineMapper
 */

export interface PolicyEngineDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface PolicyEngineEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class PolicyEngineMapper {
  toDto(entity: PolicyEngineEntityData): PolicyEngineDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: PolicyEngineDto): PolicyEngineEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: PolicyEngineEntityData[]): PolicyEngineDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: PolicyEngineDto[]): PolicyEngineEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: PolicyEngineEntityData, patch: Partial<PolicyEngineEntityData>): PolicyEngineEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
