"use strict";

describe("Zotero.Sync.Data.Local", function() {
	describe("#processSyncCacheForObjectType()", function () {
		var types = Zotero.DataObjectUtilities.getTypes();
		
		it("should update local version number if remote version is identical", function* () {
			var libraryID = Zotero.Libraries.userLibraryID;
			
			for (let type of types) {
				let objectsClass = Zotero.DataObjectUtilities.getObjectsClassForObjectType(type);
				let obj = yield createDataObject(type);
				let data = yield obj.toJSON();
				data.key = obj.key;
				data.version = 10;
				let json = {
					key: obj.key,
					version: 10,
					data: data
				};
				yield Zotero.Sync.Data.Local.saveCacheObjects(
					type, libraryID, [json]
				);
				yield Zotero.Sync.Data.Local.processSyncCacheForObjectType(
					libraryID, type, { stopOnError: true }
				);
				assert.equal(
					objectsClass.getByLibraryAndKey(libraryID, obj.key).version, 10
				);
			}
		})
	})
	
	describe("#_reconcileChanges()", function () {
		describe("items", function () {
			it("should ignore non-conflicting local changes and return remote changes", function () {
				var cacheJSON = {
					key: "AAAAAAAA",
					version: 1234,
					itemType: "book",
					title: "Title 1",
					url: "http://zotero.org/",
					publicationTitle: "Publisher", // Remove locally
					extra: "Extra", // Removed on both
					dateModified: "2015-05-14 12:34:56",
					collections: [
						'AAAAAAAA', // Removed locally
						'DDDDDDDD', // Removed remotely,
						'EEEEEEEE' // Removed from both
					],
					relations: {
						a: 'A', // Unchanged string
						c: ['C1', 'C2'], // Unchanged array
						d: 'D', // String removed locally
						e: ['E'], // Array removed locally
						f: 'F1', // String changed locally
						g: [
							'G1', // Unchanged
							'G2', // Removed remotely
							'G3' // Removed from both
						],
						h: 'H', // String removed remotely
						i: ['I'], // Array removed remotely
					},
					tags: [
						{ tag: 'A' }, // Removed locally
						{ tag: 'D' }, // Removed remotely
						{ tag: 'E' } // Removed from both
					]
				};
				var json1 = {
					key: "AAAAAAAA",
					version: 1234,
					itemType: "book",
					title: "Title 2", // Changed locally
					url: "https://www.zotero.org/", // Same change on local and remote
					place: "Place", // Added locally
					dateModified: "2015-05-14 14:12:34", // Changed locally and remotely, but ignored
					collections: [
						'BBBBBBBB', // Added locally
						'DDDDDDDD',
						'FFFFFFFF' // Added on both
					],
					relations: {
						'a': 'A',
						'b': 'B', // String added locally
						'f': 'F2',
						'g': [
							'G1',
							'G2',
							'G6' // Added locally and remotely
						],
						h: 'H', // String removed remotely
						i: ['I'], // Array removed remotely
	
					},
					tags: [
						{ tag: 'B' },
						{ tag: 'D' },
						{ tag: 'F', type: 1 }, // Added on both
						{ tag: 'G' }, // Added on both, but with different types
						{ tag: 'H', type: 1 } // Added on both, but with different types
					]
				};
				var json2 = {
					key: "AAAAAAAA",
					version: 1235,
					itemType: "book",
					title: "Title 1",
					url: "https://www.zotero.org/",
					publicationTitle: "Publisher",
					date: "2015-05-15", // Added remotely
					dateModified: "2015-05-14 13:45:12",
					collections: [
						'AAAAAAAA',
						'CCCCCCCC', // Added remotely
						'FFFFFFFF'
					],
					relations: {
						'a': 'A',
						'd': 'D',
						'e': ['E'],
						'f': 'F1',
						'g': [
							'G1',
							'G4', // Added remotely
							'G6'
						],
					},
					tags: [
						{ tag: 'A' },
						{ tag: 'C' },
						{ tag: 'F', type: 1 },
						{ tag: 'G', type: 1 },
						{ tag: 'H' }
					]
				};
				var ignoreFields = ['dateAdded', 'dateModified'];
				var result = Zotero.Sync.Data.Local._reconcileChanges(
					'item', cacheJSON, json1, json2, ignoreFields
				);
				assert.sameDeepMembers(
					result.changes,
					[
						{
							field: "date",
							op: "add",
							value: "2015-05-15"
						},
						{
							field: "collections",
							op: "member-add",
							value: "CCCCCCCC"
						},
						{
							field: "collections",
							op: "member-remove",
							value: "DDDDDDDD"
						},
						// Relations
						{
							field: "relations",
							op: "property-member-remove",
							value: {
								key: 'g',
								value: 'G2'
							}
						},
						{
							field: "relations",
							op: "property-member-add",
							value: {
								key: 'g',
								value: 'G4'
							}
						},
						{
							field: "relations",
							op: "property-member-remove",
							value: {
								key: 'h',
								value: 'H'
							}
						},
						{
							field: "relations",
							op: "property-member-remove",
							value: {
								key: 'i',
								value: 'I'
							}
						},
						// Tags
						{
							field: "tags",
							op: "member-add",
							value: {
								tag: 'C'
							}
						},
						{
							field: "tags",
							op: "member-remove",
							value: {
								tag: 'D'
							}
						},
						{
							field: "tags",
							op: "member-remove",
							value: {
								tag: 'H',
								type: 1
							}
						},
						{
							field: "tags",
							op: "member-add",
							value: {
								tag: 'H'
							}
						}
					]
				);
				assert.lengthOf(result.conflicts, 0);
			})
			
			it("should return empty arrays when no remote changes to apply", function () {
				// Similar to above but without differing remote changes
				var cacheJSON = {
					key: "AAAAAAAA",
					version: 1234,
					itemType: "book",
					title: "Title 1",
					url: "http://zotero.org/",
					publicationTitle: "Publisher", // Remove locally
					extra: "Extra", // Removed on both
					dateModified: "2015-05-14 12:34:56",
					collections: [
						'AAAAAAAA', // Removed locally
						'DDDDDDDD',
						'EEEEEEEE' // Removed from both
					],
					tags: [
						{
							tag: 'A' // Removed locally
						},
						{
							tag: 'D' // Removed remotely
						},
						{
							tag: 'E' // Removed from both
						}
					]
				};
				var json1 = {
					key: "AAAAAAAA",
					version: 1234,
					itemType: "book",
					title: "Title 2", // Changed locally
					url: "https://www.zotero.org/", // Same change on local and remote
					place: "Place", // Added locally
					dateModified: "2015-05-14 14:12:34", // Changed locally and remotely, but ignored
					collections: [
						'BBBBBBBB', // Added locally
						'DDDDDDDD',
						'FFFFFFFF' // Added on both
					],
					tags: [
						{
							tag: 'B'
						},
						{
							tag: 'D'
						},
						{
							tag: 'F', // Added on both
							type: 1
						},
						{
							tag: 'G' // Added on both, but with different types
						}
					]
				};
				var json2 = {
					key: "AAAAAAAA",
					version: 1235,
					itemType: "book",
					title: "Title 1",
					url: "https://www.zotero.org/",
					publicationTitle: "Publisher",
					dateModified: "2015-05-14 13:45:12",
					collections: [
						'AAAAAAAA',
						'DDDDDDDD',
						'FFFFFFFF'
					],
					tags: [
						{
							tag: 'A'
						},
						{
							tag: 'D'
						},
						{
							tag: 'F',
							type: 1
						},
						{
							tag: 'G',
							type: 1
						}
					]
				};
				var ignoreFields = ['dateAdded', 'dateModified'];
				var result = Zotero.Sync.Data.Local._reconcileChanges(
					'item', cacheJSON, json1, json2, ignoreFields
				);
				assert.lengthOf(result.changes, 0);
				assert.lengthOf(result.conflicts, 0);
			})
			
			it("should return conflict when changes can't be automatically resolved", function () {
				var cacheJSON = {
					key: "AAAAAAAA",
					version: 1234,
					title: "Title 1",
					dateModified: "2015-05-14 12:34:56"
				};
				var json1 = {
					key: "AAAAAAAA",
					version: 1234,
					title: "Title 2",
					dateModified: "2015-05-14 14:12:34"
				};
				var json2 = {
					key: "AAAAAAAA",
					version: 1235,
					title: "Title 3",
					dateModified: "2015-05-14 13:45:12"
				};
				var ignoreFields = ['dateAdded', 'dateModified'];
				var result = Zotero.Sync.Data.Local._reconcileChanges(
					'item', cacheJSON, json1, json2, ignoreFields
				);
				Zotero.debug('=-=-=-=');
				Zotero.debug(result);
				assert.lengthOf(result.changes, 0);
				assert.sameDeepMembers(
					result.conflicts,
					[
						[
							{
								field: "title",
								op: "modify",
								value: "Title 2"
							},
							{
								field: "title",
								op: "modify",
								value: "Title 3"
							}
						]
					]
				);
			})
			
			it("should automatically merge array/object members and generate conflicts for field changes in absence of cached version", function () {
				var json1 = {
					key: "AAAAAAAA",
					version: 1234,
					itemType: "book",
					title: "Title",
					creators: [
						{
							name: "Center for History and New Media",
							creatorType: "author"
						}
					],
					place: "Place", // Local
					dateModified: "2015-05-14 14:12:34", // Changed on both, but ignored
					collections: [
						'AAAAAAAA' // Local
					],
					relations: {
						'a': 'A',
						'b': 'B', // Local
						'e': 'E1',
						'f': [
							'F1',
							'F2' // Local
						],
						h: 'H', // String removed remotely
						i: ['I'], // Array removed remotely
					},
					tags: [
						{ tag: 'A' }, // Local
						{ tag: 'C' },
						{ tag: 'F', type: 1 },
						{ tag: 'G' }, // Different types
						{ tag: 'H', type: 1 } // Different types
					]
				};
				var json2 = {
					key: "AAAAAAAA",
					version: 1235,
					itemType: "book",
					title: "Title",
					creators: [
						{
							creatorType: "author", // Different property order shouldn't matter
							name: "Center for History and New Media"
						}
					],
					date: "2015-05-15", // Remote
					dateModified: "2015-05-14 13:45:12",
					collections: [
						'BBBBBBBB' // Remote
					],
					relations: {
						'a': 'A',
						'c': 'C', // Remote
						'd': ['D'], // Remote
						'e': 'E2',
						'f': [
							'F1',
							'F3' // Remote
						],
					},
					tags: [
						{ tag: 'B' }, // Remote
						{ tag: 'C' },
						{ tag: 'F', type: 1 },
						{ tag: 'G', type: 1 }, // Different types
						{ tag: 'H' } // Different types
					]
				};
				var ignoreFields = ['dateAdded', 'dateModified'];
				var result = Zotero.Sync.Data.Local._reconcileChanges(
					'item', false, json1, json2, ignoreFields
				);
				Zotero.debug(result);
				assert.sameDeepMembers(
					result.changes,
					[
						// Collections
						{
							field: "collections",
							op: "member-add",
							value: "BBBBBBBB"
						},
						// Relations
						{
							field: "relations",
							op: "property-member-add",
							value: {
								key: 'c',
								value: 'C'
							}
						},
						{
							field: "relations",
							op: "property-member-add",
							value: {
								key: 'd',
								value: 'D'
							}
						},
						{
							field: "relations",
							op: "property-member-add",
							value: {
								key: 'e',
								value: 'E2'
							}
						},
						{
							field: "relations",
							op: "property-member-add",
							value: {
								key: 'f',
								value: 'F3'
							}
						},
						// Tags
						{
							field: "tags",
							op: "member-add",
							value: {
								tag: 'B'
							}
						},
						{
							field: "tags",
							op: "member-add",
							value: {
								tag: 'G',
								type: 1
							}
						},
						{
							field: "tags",
							op: "member-add",
							value: {
								tag: 'H'
							}
						}
					]
				);
				assert.sameDeepMembers(
					result.conflicts,
					[
						{
							field: "place",
							op: "delete"
						},
						{
							field: "date",
							op: "add",
							value: "2015-05-15"
						}
					]
				);
			})
		})
		
		
		describe("collections", function () {
			it("should ignore non-conflicting local changes and return remote changes", function () {
				var cacheJSON = {
					key: "AAAAAAAA",
					version: 1234,
					name: "Name 1",
					parentCollection: null,
					relations: {
						A: "A", // Removed locally
						C: "C" // Removed on both
					}
				};
				var json1 = {
					key: "AAAAAAAA",
					version: 1234,
					name: "Name 2", // Changed locally
					parentCollection: null,
					relations: {}
				};
				var json2 = {
					key: "AAAAAAAA",
					version: 1234,
					name: "Name 1",
					parentCollection: "BBBBBBBB", // Added remotely
					relations: {
						A: "A",
						B: "B" // Added remotely
					}
				};
				var result = Zotero.Sync.Data.Local._reconcileChanges(
					'collection', cacheJSON, json1, json2
				);
				assert.sameDeepMembers(
					result.changes,
					[
						{
							field: "parentCollection",
							op: "add",
							value: "BBBBBBBB"
						},
						{
							field: "relations",
							op: "property-member-add",
							value: {
								key: "B",
								value: "B"
							}
						}
					]
				);
				assert.lengthOf(result.conflicts, 0);
			})
			
			it("should return empty arrays when no remote changes to apply", function () {
				// Similar to above but without differing remote changes
				var cacheJSON = {
					key: "AAAAAAAA",
					version: 1234,
					name: "Name 1",
					conditions: [
						{
							condition: "title",
							operator: "contains",
							value: "A"
						},
						{
							condition: "place",
							operator: "is",
							value: "Chicago"
						}
					]
				};
				var json1 = {
					key: "AAAAAAAA",
					version: 1234,
					name: "Name 2", // Changed locally
					conditions: [
						{
							condition: "title",
							operator: "contains",
							value: "A"
						},
						// Added locally
						{
							condition: "place",
							operator: "is",
							value: "New York"
						},
						{
							condition: "place",
							operator: "is",
							value: "Chicago"
						}
					]
				};
				var json2 = {
					key: "AAAAAAAA",
					version: 1234,
					name: "Name 1",
					conditions: [
						{
							condition: "title",
							operator: "contains",
							value: "A"
						},
						{
							condition: "place",
							operator: "is",
							value: "Chicago"
						}
					]
				};
				var result = Zotero.Sync.Data.Local._reconcileChanges(
					'search', cacheJSON, json1, json2
				);
				assert.lengthOf(result.changes, 0);
				assert.lengthOf(result.conflicts, 0);
			})
			
			it("should automatically resolve conflicts with remote version", function () {
				var cacheJSON = {
					key: "AAAAAAAA",
					version: 1234,
					name: "Name 1"
				};
				var json1 = {
					key: "AAAAAAAA",
					version: 1234,
					name: "Name 2"
				};
				var json2 = {
					key: "AAAAAAAA",
					version: 1234,
					name: "Name 3"
				};
				var result = Zotero.Sync.Data.Local._reconcileChanges(
					'search', cacheJSON, json1, json2
				);
				assert.sameDeepMembers(
					result.changes,
					[
						{
							field: "name",
							op: "modify",
							value: "Name 3"
						}
					]
				);
				assert.lengthOf(result.conflicts, 0);
			})
			
			it("should automatically resolve conflicts in absence of cached version", function () {
				var json1 = {
					key: "AAAAAAAA",
					version: 1234,
					name: "Name 1",
					conditions: [
						{
							condition: "title",
							operator: "contains",
							value: "A"
						},
						{
							condition: "place",
							operator: "is",
							value: "New York"
						}
					]
				};
				var json2 = {
					key: "AAAAAAAA",
					version: 1234,
					name: "Name 2",
					conditions: [
						{
							condition: "title",
							operator: "contains",
							value: "A"
						},
						{
							condition: "place",
							operator: "is",
							value: "Chicago"
						}
					]
				};
				var result = Zotero.Sync.Data.Local._reconcileChanges(
					'search', false, json1, json2
				);
				assert.sameDeepMembers(
					result.changes,
					[
						{
							field: "name",
							op: "modify",
							value: "Name 2"
						},
						{
							field: "conditions",
							op: "member-add",
							value: {
								condition: "place",
								operator: "is",
								value: "Chicago"
							}
						}
					]
				);
				assert.lengthOf(result.conflicts, 0);
			})
		})
		
		
		describe("searches", function () {
			it("should ignore non-conflicting local changes and return remote changes", function () {
				var cacheJSON = {
					key: "AAAAAAAA",
					version: 1234,
					name: "Name 1",
					conditions: [
						{
							condition: "title",
							operator: "contains",
							value: "A"
						},
						{
							condition: "place",
							operator: "is",
							value: "Chicago"
						}
					]
				};
				var json1 = {
					key: "AAAAAAAA",
					version: 1234,
					name: "Name 2", // Changed locally
					conditions: [
						{
							condition: "title",
							operator: "contains",
							value: "A"
						},
						// Removed remotely
						{
							condition: "place",
							operator: "is",
							value: "Chicago"
						}
					]
				};
				var json2 = {
					key: "AAAAAAAA",
					version: 1234,
					name: "Name 1",
					conditions: [
						{
							condition: "title",
							operator: "contains",
							value: "A"
						},
						// Added remotely
						{
							condition: "place",
							operator: "is",
							value: "New York"
						}
					]
				};
				var result = Zotero.Sync.Data.Local._reconcileChanges(
					'search', cacheJSON, json1, json2
				);
				assert.sameDeepMembers(
					result.changes,
					[
						{
							field: "conditions",
							op: "member-add",
							value: {
								condition: "place",
								operator: "is",
								value: "New York"
							}
						},
						{
							field: "conditions",
							op: "member-remove",
							value: {
								condition: "place",
								operator: "is",
								value: "Chicago"
							}
						}
					]
				);
				assert.lengthOf(result.conflicts, 0);
			})
			
			it("should return empty arrays when no remote changes to apply", function () {
				// Similar to above but without differing remote changes
				var cacheJSON = {
					key: "AAAAAAAA",
					version: 1234,
					name: "Name 1",
					conditions: [
						{
							condition: "title",
							operator: "contains",
							value: "A"
						},
						{
							condition: "place",
							operator: "is",
							value: "Chicago"
						}
					]
				};
				var json1 = {
					key: "AAAAAAAA",
					version: 1234,
					name: "Name 2", // Changed locally
					conditions: [
						{
							condition: "title",
							operator: "contains",
							value: "A"
						},
						// Added locally
						{
							condition: "place",
							operator: "is",
							value: "New York"
						},
						{
							condition: "place",
							operator: "is",
							value: "Chicago"
						}
					]
				};
				var json2 = {
					key: "AAAAAAAA",
					version: 1234,
					name: "Name 1",
					conditions: [
						{
							condition: "title",
							operator: "contains",
							value: "A"
						},
						{
							condition: "place",
							operator: "is",
							value: "Chicago"
						}
					]
				};
				var result = Zotero.Sync.Data.Local._reconcileChanges(
					'search', cacheJSON, json1, json2
				);
				assert.lengthOf(result.changes, 0);
				assert.lengthOf(result.conflicts, 0);
			})
			
			it("should automatically resolve conflicts with remote version", function () {
				var cacheJSON = {
					key: "AAAAAAAA",
					version: 1234,
					name: "Name 1"
				};
				var json1 = {
					key: "AAAAAAAA",
					version: 1234,
					name: "Name 2"
				};
				var json2 = {
					key: "AAAAAAAA",
					version: 1234,
					name: "Name 3"
				};
				var result = Zotero.Sync.Data.Local._reconcileChanges(
					'search', cacheJSON, json1, json2
				);
				assert.sameDeepMembers(
					result.changes,
					[
						{
							field: "name",
							op: "modify",
							value: "Name 3"
						}
					]
				);
				assert.lengthOf(result.conflicts, 0);
			})
			
			it("should automatically resolve conflicts in absence of cached version", function () {
				var json1 = {
					key: "AAAAAAAA",
					version: 1234,
					name: "Name 1",
					conditions: [
						{
							condition: "title",
							operator: "contains",
							value: "A"
						},
						{
							condition: "place",
							operator: "is",
							value: "New York"
						}
					]
				};
				var json2 = {
					key: "AAAAAAAA",
					version: 1234,
					name: "Name 2",
					conditions: [
						{
							condition: "title",
							operator: "contains",
							value: "A"
						},
						{
							condition: "place",
							operator: "is",
							value: "Chicago"
						}
					]
				};
				var result = Zotero.Sync.Data.Local._reconcileChanges(
					'search', false, json1, json2
				);
				assert.sameDeepMembers(
					result.changes,
					[
						{
							field: "name",
							op: "modify",
							value: "Name 2"
						},
						{
							field: "conditions",
							op: "member-add",
							value: {
								condition: "place",
								operator: "is",
								value: "Chicago"
							}
						}
					]
				);
				assert.lengthOf(result.conflicts, 0);
			})
		})
	})
})