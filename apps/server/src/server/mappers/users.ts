export function toUserDto(user: { id: string; email: string; name: string | null }) {
  return { id: user.id, email: user.email, name: user.name };
}
