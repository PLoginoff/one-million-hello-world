/**
 * WebsocketMapper
 */

export interface WebsocketDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface WebsocketEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class WebsocketMapper {
  toDto(entity: WebsocketEntityData): WebsocketDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: WebsocketDto): WebsocketEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: WebsocketEntityData[]): WebsocketDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: WebsocketDto[]): WebsocketEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: WebsocketEntityData, patch: Partial<WebsocketEntityData>): WebsocketEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
