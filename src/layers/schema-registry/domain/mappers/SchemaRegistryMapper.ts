/**
 * SchemaRegistryMapper
 */

export interface SchemaRegistryDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface SchemaRegistryEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class SchemaRegistryMapper {
  toDto(entity: SchemaRegistryEntityData): SchemaRegistryDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: SchemaRegistryDto): SchemaRegistryEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: SchemaRegistryEntityData[]): SchemaRegistryDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: SchemaRegistryDto[]): SchemaRegistryEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: SchemaRegistryEntityData, patch: Partial<SchemaRegistryEntityData>): SchemaRegistryEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
