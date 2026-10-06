export default {
  compressToFile: jest.fn().mockResolvedValue({ bytes: 0 }),
  decompressFromFile: jest.fn().mockResolvedValue(''),
};
