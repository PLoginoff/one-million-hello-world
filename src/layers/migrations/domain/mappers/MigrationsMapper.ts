/**
 * MigrationsMapper
 */

export interface MigrationsDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface MigrationsEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class MigrationsMapper {
  toDto(entity: MigrationsEntityData): MigrationsDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: MigrationsDto): MigrationsEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: MigrationsEntityData[]): MigrationsDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: MigrationsDto[]): MigrationsEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: MigrationsEntityData, patch: Partial<MigrationsEntityData>): MigrationsEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
