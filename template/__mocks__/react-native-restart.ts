/* eslint-disable import-x/no-default-export -- the mock must mirror the library's default export */
const RNRestart = {
  restart: jest.fn(),
  Restart: jest.fn(),
  getReason: jest.fn(() => Promise.resolve(null)),
};

export default RNRestart;
