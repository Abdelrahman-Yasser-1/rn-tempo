# Loaded only while preparing upgrade snapshots. Xcodeproj normally assigns random IDs
# to new build configurations and file references. Keep existing IDs and give the same
# env operation repeatable IDs in the base and target.
require 'xcodeproj'
require 'digest'

module TempoSnapshotUUIDs
  OPERATION = ARGV.join("\0").freeze

  def generate_uuid
    loop do
      @tempo_sequence = (@tempo_sequence || 0) + 1
      uuid = Digest::SHA256.hexdigest([OPERATION, @tempo_sequence].join("\0"))[0, 24].upcase
      return uuid unless objects_by_uuid.key?(uuid)
    end
  end
end

Xcodeproj::Project.prepend(TempoSnapshotUUIDs)
