/**
 * MultiTenancyMapper
 */

export interface MultiTenancyDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface MultiTenancyEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class MultiTenancyMapper {
  toDto(entity: MultiTenancyEntityData): MultiTenancyDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: MultiTenancyDto): MultiTenancyEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: MultiTenancyEntityData[]): MultiTenancyDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: MultiTenancyDto[]): MultiTenancyEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: MultiTenancyEntityData, patch: Partial<MultiTenancyEntityData>): MultiTenancyEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
