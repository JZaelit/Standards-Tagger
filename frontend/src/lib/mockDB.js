// In-memory mock database — data resets on page refresh
export const mockDB = {
  assignments: [
    {
      id: '1',
      name: 'Fraction Word Problems',
      grade: '5th',
      description: 'Students solve multi-step word problems involving addition and subtraction of fractions.',
      curriculum_id: 'c1',
      created_at: '2026-04-01T10:00:00Z',
    },
    {
      id: '2',
      name: 'Area & Perimeter Quiz',
      grade: '4th',
      description: 'Assessment on calculating area and perimeter of rectangles.',
      curriculum_id: 'c2',
      created_at: '2026-04-02T10:00:00Z',
    },
  ],
  curriculum: [
    {
      id: 'c1',
      title: 'California Common Core Math',
      grade: '5th',
      created_at: '2026-03-20T10:00:00Z',
    },
    {
      id: 'c2',
      title: 'California Common Core Math',
      grade: '4th',
      created_at: '2026-03-21T10:00:00Z',
    },
  ],
  standards: [],
};
