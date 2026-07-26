/**
 * SerializationMapper
 */

export interface SerializationDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface SerializationEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class SerializationMapper {
  toDto(entity: SerializationEntityData): SerializationDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: SerializationDto): SerializationEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: SerializationEntityData[]): SerializationDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: SerializationDto[]): SerializationEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: SerializationEntityData, patch: Partial<SerializationEntityData>): SerializationEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
