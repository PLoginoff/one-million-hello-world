/**
 * UnitOfWorkMapper
 */

export interface UnitOfWorkDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface UnitOfWorkEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class UnitOfWorkMapper {
  toDto(entity: UnitOfWorkEntityData): UnitOfWorkDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: UnitOfWorkDto): UnitOfWorkEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: UnitOfWorkEntityData[]): UnitOfWorkDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: UnitOfWorkDto[]): UnitOfWorkEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: UnitOfWorkEntityData, patch: Partial<UnitOfWorkEntityData>): UnitOfWorkEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
