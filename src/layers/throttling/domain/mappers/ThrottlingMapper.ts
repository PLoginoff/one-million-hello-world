/**
 * ThrottlingMapper
 */

export interface ThrottlingDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface ThrottlingEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class ThrottlingMapper {
  toDto(entity: ThrottlingEntityData): ThrottlingDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: ThrottlingDto): ThrottlingEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: ThrottlingEntityData[]): ThrottlingDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: ThrottlingDto[]): ThrottlingEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: ThrottlingEntityData, patch: Partial<ThrottlingEntityData>): ThrottlingEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
