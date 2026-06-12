export interface GroupMember {
    providerId: string;
    modelId: string;
    name: string;
}

export interface GroupConfig {
    members: GroupMember[];
}
