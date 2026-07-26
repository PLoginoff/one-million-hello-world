/**
 * HttpParserMapper
 */

export interface HttpParserDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface HttpParserEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class HttpParserMapper {
  toDto(entity: HttpParserEntityData): HttpParserDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: HttpParserDto): HttpParserEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: HttpParserEntityData[]): HttpParserDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: HttpParserDto[]): HttpParserEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: HttpParserEntityData, patch: Partial<HttpParserEntityData>): HttpParserEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
