/**
 * FacadeMapper
 */

export interface FacadeDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface FacadeEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class FacadeMapper {
  toDto(entity: FacadeEntityData): FacadeDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: FacadeDto): FacadeEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: FacadeEntityData[]): FacadeDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: FacadeDto[]): FacadeEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: FacadeEntityData, patch: Partial<FacadeEntityData>): FacadeEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
